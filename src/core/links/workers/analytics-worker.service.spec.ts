import { ConfigService } from '@nestjs/config';
import { CacheService, ClickQueuePayload } from '../../cache/cache.service';
import {
  CreateLinkEventRecord,
  ILinkEventRepository,
} from '../interfaces/link-event-repository.interface';
import { ILinkRepository } from '../interfaces/link-repository.interface';
import {
  AnalyticsWorkerService,
  DEFAULT_WORKER_INTERVAL_MS,
} from './analytics-worker.service';

describe('AnalyticsWorkerService (Orchestrator Pattern - Happy, Sad & Edge Cases)', () => {
  let workerService: AnalyticsWorkerService;
  let cacheServiceMock: jest.Mocked<Partial<CacheService>>;
  let linkRepositoryMock: jest.Mocked<Partial<ILinkRepository>>;
  let linkEventRepositoryMock: jest.Mocked<ILinkEventRepository>;
  let configServiceMock: jest.Mocked<Partial<ConfigService>>;

  beforeEach(() => {
    jest.useFakeTimers();

    cacheServiceMock = {
      popClickEventsBatch: jest.fn().mockResolvedValue([]),
      reEnqueueClickEventsBatch: jest.fn().mockResolvedValue(undefined),
    };

    linkRepositoryMock = {
      findIdsByShortCodes: jest.fn().mockResolvedValue([]),
    };

    linkEventRepositoryMock = {
      getTotalsAndUniqueVisitors: jest.fn(),
      getDailyTimeline: jest.fn(),
      getTopOsBreakdown: jest.fn(),
      getTopBrowsersBreakdown: jest.fn(),
      getTopCountriesBreakdown: jest.fn(),
      getTopReferrersBreakdown: jest.fn(),
      insertBatch: jest.fn().mockResolvedValue(undefined),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'ANALYTICS_WORKER_ENABLED') return 'true';
        if (key === 'ANALYTICS_WORKER_INTERVAL_MS') return 15000;
        if (key === 'ANALYTICS_WORKER_BATCH_SIZE') return 200;
        return defaultValue;
      }),
    };

    workerService = new AnalyticsWorkerService(
      cacheServiceMock as unknown as CacheService,
      linkRepositoryMock as unknown as ILinkRepository,
      linkEventRepositoryMock,
      configServiceMock as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Happy Path: Orchestrator batch consumption and persistence', () => {
    it('consumes events from Redis, enriches OS/browser metadata and persists into PostgreSQL', async () => {
      const sampleEvents: ClickQueuePayload[] = [
        {
          linkId: 'link-uuid-1',
          shortCode: 'brand-qr',
          ipAddress: '190.12.50.1',
          country: 'hn',
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
          referer: ' https://whatsapp.com/ ',
          scannedAt: '2026-10-31T15:00:00.000Z',
        },
        {
          shortCode: 'summer-sale',
          ipAddress: '181.115.22.4',
          country: null,
          userAgent:
            'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
          referer: null,
          scannedAt: '2026-10-31T15:05:00.000Z',
        },
      ];

      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValue(
        sampleEvents,
      );
      (linkRepositoryMock.findIdsByShortCodes as jest.Mock).mockResolvedValue([
        { id: 'link-uuid-2', shortCode: 'summer-sale' },
      ]);

      const count = await workerService.processBatch(100);

      expect(count).toBe(2);
      expect(cacheServiceMock.popClickEventsBatch).toHaveBeenCalledWith(100);
      expect(linkRepositoryMock.findIdsByShortCodes).toHaveBeenCalledWith([
        'summer-sale',
      ]);
      expect(linkEventRepositoryMock.insertBatch).toHaveBeenCalledTimes(1);

      const inserted = (linkEventRepositoryMock.insertBatch as jest.Mock).mock
        .calls[0][0] as CreateLinkEventRecord[];

      expect(inserted).toHaveLength(2);
      expect(inserted[0]).toEqual({
        linkId: 'link-uuid-1',
        ipAddress: '190.12.50.1',
        userAgent: expect.any(String),
        country: 'HN',
        os: 'iOS',
        browser: 'Mobile Safari',
        referer: 'https://whatsapp.com/',
        scannedAt: new Date('2026-10-31T15:00:00.000Z'),
      });
      expect(inserted[1]).toEqual({
        linkId: 'link-uuid-2',
        ipAddress: '181.115.22.4',
        userAgent: expect.any(String),
        country: null,
        os: 'Android',
        browser: 'Chrome Mobile',
        referer: null,
        scannedAt: new Date('2026-10-31T15:05:00.000Z'),
      });
    });

    it('reuses in-memory shortCode-to-linkId cache to minimize database roundtrips', async () => {
      const event1: ClickQueuePayload = {
        shortCode: 'repeated-code',
        ipAddress: '10.0.0.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/112.0.1722.34',
        referer: null,
        scannedAt: new Date().toISOString(),
      };

      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValueOnce([
        event1,
      ]);
      (linkRepositoryMock.findIdsByShortCodes as jest.Mock).mockResolvedValueOnce([
        { id: 'link-uuid-repeated', shortCode: 'repeated-code' },
      ]);

      await workerService.processBatch();
      expect(linkRepositoryMock.findIdsByShortCodes).toHaveBeenCalledTimes(1);

      // Second cycle with same shortCode
      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValueOnce([
        event1,
      ]);
      await workerService.processBatch();

      // Should not query the database again because of internal cache
      expect(linkRepositoryMock.findIdsByShortCodes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases & Parser Auxiliary Methods', () => {
    it('returns 0 immediately if queue is empty', async () => {
      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValue([]);

      const result = await workerService.processBatch();

      expect(result).toBe(0);
      expect(linkRepositoryMock.findIdsByShortCodes).not.toHaveBeenCalled();
      expect(linkEventRepositoryMock.insertBatch).not.toHaveBeenCalled();
    });

    it('discards events when shortCode cannot be resolved in DB (e.g., deleted link)', async () => {
      const orphanedEvent: ClickQueuePayload = {
        shortCode: 'deleted-slug',
        ipAddress: '1.2.3.4',
        userAgent: 'curl/7.68.0',
        referer: null,
        scannedAt: new Date().toISOString(),
      };

      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValue([
        orphanedEvent,
      ]);
      (linkRepositoryMock.findIdsByShortCodes as jest.Mock).mockResolvedValue([]);

      const result = await workerService.processBatch();

      expect(result).toBe(0);
      expect(linkEventRepositoryMock.insertBatch).not.toHaveBeenCalled();
    });

    it('correctly maps various browser and OS user agents including fallbacks', async () => {
      const variations: ClickQueuePayload[] = [
        {
          linkId: 'l1',
          shortCode: 's1',
          ipAddress: '1.1.1.1',
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/110.0.0.0 Safari/537.36',
          referer: null,
          scannedAt: '2026-10-31T12:00:00.000Z',
        },
        {
          linkId: 'l2',
          shortCode: 's2',
          ipAddress: '1.1.1.2',
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/16.3 Safari/605.1.15',
          referer: null,
          scannedAt: '2026-10-31T12:00:00.000Z',
        },
        {
          linkId: 'l3',
          shortCode: 's3',
          ipAddress: '1.1.1.3',
          userAgent:
            'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0',
          referer: null,
          scannedAt: '2026-10-31T12:00:00.000Z',
        },
        {
          linkId: 'l4',
          shortCode: 's4',
          ipAddress: '1.1.1.4',
          userAgent: 'CustomScannerBot/2.0',
          referer: null,
          scannedAt: 'invalid-date-string',
        },
        {
          linkId: 'l5',
          shortCode: 's5',
          ipAddress: '1.1.1.5',
          userAgent: null,
          referer: null,
          scannedAt: '' as unknown as string,
        },
      ];

      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValue(
        variations,
      );

      await workerService.processBatch();

      const inserted = (linkEventRepositoryMock.insertBatch as jest.Mock).mock
        .calls[0][0] as CreateLinkEventRecord[];

      expect(inserted).toHaveLength(5);
      // macOS Chrome
      expect(inserted[0].os).toBe('macOS');
      expect(inserted[0].browser).toBe('Chrome');
      // macOS Safari
      expect(inserted[1].os).toBe('macOS');
      expect(inserted[1].browser).toBe('Safari');
      // Linux Firefox
      expect(inserted[2].os).toBe('Linux');
      expect(inserted[2].browser).toBe('Firefox');
      // Unknown / Others
      expect(inserted[3].os).toBe('Others');
      expect(inserted[3].browser).toBe('Others');
      expect(inserted[3].scannedAt).toBeInstanceOf(Date);
      // Empty / Null
      expect(inserted[4].os).toBe('Others');
      expect(inserted[4].browser).toBe('Others');
      expect(inserted[4].scannedAt).toBeInstanceOf(Date);
    });
  });

  describe('Concurrency & Lifecycle Management', () => {
    it('prevents overlapping runs when a cycle is already in progress', async () => {
      let resolveBatch: (value: ClickQueuePayload[]) => void;
      const batchPromise = new Promise<ClickQueuePayload[]>((res) => {
        resolveBatch = res;
      });

      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockReturnValue(
        batchPromise,
      );

      // Start first cycle (pending)
      const firstCyclePromise = workerService.runCycle();

      // Second cycle triggered while first is still running
      const secondCycleResult = await workerService.runCycle();
      expect(secondCycleResult).toBe(0);

      // Resolve first cycle
      resolveBatch!([]);
      const firstCycleResult = await firstCyclePromise;
      expect(firstCycleResult).toBe(0);
    });

    it('catches and handles unhandled errors during batch execution without crashing', async () => {
      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockRejectedValue(
        new Error('Redis connection failure'),
      );

      const result = await workerService.runCycle();
      expect(result).toBe(0);
    });

    it('re-enqueues events back into Redis if PostgreSQL batch persistence fails', async () => {
      const sampleEvents: ClickQueuePayload[] = [
        {
          linkId: 'link-uuid-1',
          shortCode: 'qr-1',
          ipAddress: '127.0.0.1',
          country: 'HN',
          userAgent: 'TestBrowser',
          referer: null,
          scannedAt: '2026-10-31T15:00:00.000Z',
        },
      ];

      (cacheServiceMock.popClickEventsBatch as jest.Mock).mockResolvedValue(
        sampleEvents,
      );
      (linkEventRepositoryMock.insertBatch as jest.Mock).mockRejectedValue(
        new Error('Database deadlock / connection timeout'),
      );

      const result = await workerService.runCycle();
      expect(result).toBe(0);
      expect(cacheServiceMock.reEnqueueClickEventsBatch).toHaveBeenCalledWith(
        sampleEvents,
      );
    });

    it('initializes timer on module init and runs cycle periodically', () => {
      const runCycleSpy = jest
        .spyOn(workerService, 'runCycle')
        .mockResolvedValue(0);

      workerService.onModuleInit();

      // Advance by 15 seconds
      jest.advanceTimersByTime(DEFAULT_WORKER_INTERVAL_MS);
      expect(runCycleSpy).toHaveBeenCalledTimes(1);

      // Advance by another 15 seconds
      jest.advanceTimersByTime(DEFAULT_WORKER_INTERVAL_MS);
      expect(runCycleSpy).toHaveBeenCalledTimes(2);
    });

    it('does not start timer if ANALYTICS_WORKER_ENABLED is set to false', () => {
      (configServiceMock.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'ANALYTICS_WORKER_ENABLED') return 'false';
          return defaultValue;
        },
      );

      const runCycleSpy = jest
        .spyOn(workerService, 'runCycle')
        .mockResolvedValue(0);

      workerService.onModuleInit();

      jest.advanceTimersByTime(DEFAULT_WORKER_INTERVAL_MS * 2);
      expect(runCycleSpy).not.toHaveBeenCalled();
    });

    it('flushes pending events and clears interval timer on module destroy', async () => {
      workerService.onModuleInit();

      const processBatchSpy = jest
        .spyOn(workerService, 'processBatch')
        .mockResolvedValue(5);

      await workerService.onModuleDestroy();

      expect(processBatchSpy).toHaveBeenCalledTimes(1);

      // Further timer advances should do nothing
      jest.advanceTimersByTime(DEFAULT_WORKER_INTERVAL_MS);
    });
  });
});
