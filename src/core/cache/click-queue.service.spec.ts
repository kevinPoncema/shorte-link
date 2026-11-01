import {
  CLICKS_QUEUE_KEY,
  ClickQueueService,
} from './click-queue.service';
import { ClickEventPayload } from '../links/interfaces/click-event.interface';

describe('ClickQueueService', () => {
  let clickQueueService: ClickQueueService;
  let redisMock: {
    lpush: jest.Mock;
    rpop: jest.Mock;
    llen: jest.Mock;
    pipeline: jest.Mock;
  };

  const samplePayload: ClickEventPayload = {
    shortCode: 'qr-xyz',
    linkId: 'link-123',
    ipAddress: '192.168.1.1',
    country: 'HN',
    userAgent: 'Mozilla/5.0 Chrome',
    referer: 'https://google.com',
    scannedAt: '2026-11-01T20:00:00.000Z',
  };

  beforeEach(() => {
    redisMock = {
      lpush: jest.fn().mockResolvedValue(1),
      rpop: jest.fn().mockResolvedValue([JSON.stringify(samplePayload)]),
      llen: jest.fn().mockResolvedValue(5),
      pipeline: jest.fn(),
    };

    clickQueueService = new ClickQueueService(redisMock as never);
  });

  describe('enqueueClickEvent', () => {
    it('pushes JSON-serialized payload to queue:clicks via LPUSH', async () => {
      await clickQueueService.enqueueClickEvent(samplePayload);
      expect(redisMock.lpush).toHaveBeenCalledWith(
        CLICKS_QUEUE_KEY,
        JSON.stringify(samplePayload),
      );
    });
  });

  describe('popClickEventsBatch', () => {
    it('returns empty array when batchSize <= 0', async () => {
      const result = await clickQueueService.popClickEventsBatch(0);
      expect(result).toEqual([]);
      expect(redisMock.rpop).not.toHaveBeenCalled();
    });

    it('returns parsed events from native multi-element RPOP', async () => {
      const result = await clickQueueService.popClickEventsBatch(10);
      expect(redisMock.rpop).toHaveBeenCalledWith(CLICKS_QUEUE_KEY, 10);
      expect(result).toHaveLength(1);
      expect(result[0].shortCode).toBe('qr-xyz');
    });

    it('falls back to pipelined single RPOPs when multi-element RPOP throws', async () => {
      redisMock.rpop.mockRejectedValueOnce(new Error('syntax error'));

      const execMock = jest
        .fn()
        .mockResolvedValue([[null, JSON.stringify(samplePayload)]]);
      const pipelineInstance = {
        rpop: jest.fn().mockReturnThis(),
        exec: execMock,
      };
      redisMock.pipeline.mockReturnValue(pipelineInstance);

      const result = await clickQueueService.popClickEventsBatch(2);
      expect(pipelineInstance.rpop).toHaveBeenCalledTimes(2);
      expect(execMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].shortCode).toBe('qr-xyz');
    });

    it('resiliently ignores corrupted JSON in the queue', async () => {
      redisMock.rpop.mockResolvedValueOnce([
        'invalid-json{{{',
        JSON.stringify(samplePayload),
      ]);

      const result = await clickQueueService.popClickEventsBatch(5);
      expect(result).toHaveLength(1);
      expect(result[0].shortCode).toBe('qr-xyz');
    });
  });

  describe('getQueueLength', () => {
    it('delegates to redis.llen', async () => {
      const length = await clickQueueService.getQueueLength();
      expect(redisMock.llen).toHaveBeenCalledWith(CLICKS_QUEUE_KEY);
      expect(length).toBe(5);
    });
  });
});
