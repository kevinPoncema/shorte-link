import {
  CLICKS_QUEUE_KEY,
  CacheService,
  ClickQueuePayload,
} from './cache.service';

describe('CacheService', () => {
  let cacheService: CacheService;
  let redisMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    lpush: jest.Mock;
    config?: jest.Mock;
    quit: jest.Mock;
    disconnect: jest.Mock;
    status: string;
  };

  beforeEach(() => {
    redisMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      config: jest.fn().mockResolvedValue('OK'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      status: 'ready',
    };

    cacheService = new CacheService(redisMock as never);
  });

  describe('Lifecycle hooks (Happy, Sad & Edge Cases)', () => {
    it('configures allkeys-lru eviction policy on module init', async () => {
      await cacheService.onModuleInit();
      expect(redisMock.config).toHaveBeenCalledWith(
        'SET',
        'maxmemory-policy',
        'allkeys-lru',
      );
    });

    it('gracefully tolerates managed Redis servers that block CONFIG commands', async () => {
      redisMock.config?.mockRejectedValueOnce(
        new Error('ERR unknown command CONFIG'),
      );
      await expect(cacheService.onModuleInit()).resolves.toBeUndefined();
    });

    it('gracefully skips runtime configuration if redis client lacks config method', async () => {
      delete redisMock.config;
      await expect(cacheService.onModuleInit()).resolves.toBeUndefined();
    });

    it('quits cleanly on module destroy when connection is active', async () => {
      await cacheService.onModuleDestroy();
      expect(redisMock.quit).toHaveBeenCalledTimes(1);
      expect(redisMock.disconnect).not.toHaveBeenCalled();
    });

    it('skips quit() when Redis connection status is already "end"', async () => {
      redisMock.status = 'end';
      await cacheService.onModuleDestroy();
      expect(redisMock.quit).not.toHaveBeenCalled();
    });

    it('falls back to force disconnect() if quit() rejects during shutdown', async () => {
      redisMock.quit.mockRejectedValueOnce(new Error('Socket closed'));
      await cacheService.onModuleDestroy();
      expect(redisMock.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Data Plane operations', () => {
    it('reads, sets, returns null on miss, and invalidates redirect keys with r:{shortCode}', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      await expect(cacheService.getRedirectTarget('missing')).resolves.toBeNull();

      await cacheService.setRedirectTarget('abc1234', 'https://example.com');
      expect(redisMock.set).toHaveBeenCalledWith(
        'r:abc1234',
        'https://example.com',
      );

      redisMock.get.mockResolvedValueOnce('https://example.com');
      const target = await cacheService.getRedirectTarget('abc1234');
      expect(redisMock.get).toHaveBeenCalledWith('r:abc1234');
      expect(target).toBe('https://example.com');

      await cacheService.invalidateRedirectTarget('abc1234');
      expect(redisMock.del).toHaveBeenCalledWith('r:abc1234');
    });

    it('pushes click payloads into queue:clicks via LPUSH', async () => {
      const payload: ClickQueuePayload = {
        shortCode: 'abc1234',
        linkId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        ipAddress: 'hashed-ip',
        userAgent: null,
        referer: null,
        scannedAt: '2026-10-31T22:00:00.000Z',
      };

      await cacheService.enqueueClickEvent(payload);

      expect(redisMock.lpush).toHaveBeenCalledWith(
        CLICKS_QUEUE_KEY,
        JSON.stringify(payload),
      );
    });
  });
});
