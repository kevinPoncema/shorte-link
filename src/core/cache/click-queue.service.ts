import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ClickEventPayload } from '../links/interfaces/click-event.interface';
import { REDIS_CLIENT } from './cache.service';

export const CLICKS_QUEUE_KEY = 'queue:clicks';

/**
 * Servicio especializado en la gestión de la cola FIFO de eventos de analíticas (`queue:clicks`).
 *
 * Desacopla la lógica de mensajería asíncrona de `CacheService`, aplicando el
 * Principio de Responsabilidad Única (SRP).
 */
@Injectable()
export class ClickQueueService {
  private readonly logger = new Logger(ClickQueueService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Inserta un evento analítico al inicio de la cola Redis (`LPUSH queue:clicks`).
   */
  async enqueueClickEvent(payload: ClickEventPayload): Promise<void> {
    await this.redis.lpush(CLICKS_QUEUE_KEY, JSON.stringify(payload));
  }

  /**
   * Reinserta en bloque una lista de eventos al inicio de la cola Redis (`LPUSH queue:clicks`)
   * para prevenir pérdida de datos en caso de errores transitorios en la base de datos.
   */
  async reEnqueueBatch(events: ClickEventPayload[]): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.lpush(CLICKS_QUEUE_KEY, JSON.stringify(event));
    }
    await pipeline.exec();
  }

  /**
   * Extrae en lote hasta `batchSize` eventos del final de la cola Redis (`RPOP queue:clicks`),
   * liberando memoria RAM de Redis para que el worker los persista en PostgreSQL.
   */
  async popClickEventsBatch(
    batchSize: number = 200,
  ): Promise<ClickEventPayload[]> {
    if (batchSize <= 0) {
      return [];
    }

    try {
      // Intento con RPOP multi-elemento nativo en Redis 6.2+
      const raw = await (this.redis as any).rpop(CLICKS_QUEUE_KEY, batchSize);
      if (!raw) {
        return [];
      }
      const rawItems: string[] = Array.isArray(raw) ? raw : [raw];
      return this.parseRawQueueItems(rawItems);
    } catch {
      // Fallback con pipeline para versiones anteriores de Redis o entornos de mock
      const pipeline = this.redis.pipeline();
      for (let i = 0; i < batchSize; i++) {
        pipeline.rpop(CLICKS_QUEUE_KEY);
      }
      const results = await pipeline.exec();
      if (!results) {
        return [];
      }

      const rawItems: string[] = [];
      for (const [err, val] of results) {
        if (!err && typeof val === 'string') {
          rawItems.push(val);
        }
      }
      return this.parseRawQueueItems(rawItems);
    }
  }

  /**
   * Retorna la cantidad de eventos encolados pendientes en Redis (`LLEN queue:clicks`).
   */
  async getQueueLength(): Promise<number> {
    return this.redis.llen(CLICKS_QUEUE_KEY);
  }

  /**
   * Parsea cadenas JSON ignorando registros malformados de forma defensiva.
   */
  private parseRawQueueItems(rawItems: string[]): ClickEventPayload[] {
    const valid: ClickEventPayload[] = [];
    for (const raw of rawItems) {
      try {
        const item = JSON.parse(raw) as ClickEventPayload;
        if (item && item.shortCode && item.ipAddress) {
          valid.push(item);
        }
      } catch {
        // Ignora JSON corrupto
      }
    }
    return valid;
  }
}
