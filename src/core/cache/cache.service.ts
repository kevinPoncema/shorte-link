import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  ClickEventPayload,
  ClickQueuePayload,
} from '../links/interfaces/click-event.interface';
import {
  CLICKS_QUEUE_KEY,
  ClickQueueService,
} from './click-queue.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const REDIRECT_KEY_PREFIX = 'r:';

export const DEFAULT_REDIRECT_CACHE_TTL_SECONDS = 86400; // 24 horas

export {
  ClickEventPayload,
  ClickQueuePayload,
  CLICKS_QUEUE_KEY,
};

/**
 * Servicio de acceso a la capa de caché en memoria Redis (Data Plane de Redirección).
 * Administra el ciclo de vida de claves `r:{shortCode}` bajo política `allkeys-lru`
 * con soporte para TTL configurable y precalentamiento.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly clickQueueService?: ClickQueueService,
  ) { }

  /**
   * Intenta configurar `maxmemory-policy allkeys-lru` en tiempo de arranque.
   * Si el proveedor administrado de Redis bloquea `CONFIG`, registra aviso no fatal.
   */
  async onModuleInit(): Promise<void> {
    try {
      if (typeof this.redis.config === 'function') {
        await this.redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
      }
    } catch (error) {
      this.logger.debug(
        `Skipped runtime maxmemory-policy configuration: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Cierra limpiamente la conexión TCP con Redis durante el apagado de la aplicación.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.redis && this.redis.status !== 'end') {
        await this.redis.quit();
      }
    } catch {
      this.redis.disconnect();
    }
  }

  /**
   * Construye la clave canónica de caché para un `shortCode` (`r:{shortCode}`).
   */
  buildRedirectKey(shortCode: string): string {
    return `${REDIRECT_KEY_PREFIX}${shortCode}`;
  }

  /**
   * Obtiene la URL de destino almacenada en caché para un `shortCode`.
   */
  async getRedirectTarget(shortCode: string): Promise<string | null> {
    return this.redis.get(this.buildRedirectKey(shortCode));
  }

  /**
   * Almacena o precalienta la URL de destino en Redis (`SET r:{shortCode} {targetUrl}`).
   * Permite especificar un TTL opcional en segundos para evitar acumulación indefinida de claves frías.
   */
  async setRedirectTarget(
    shortCode: string,
    targetUrl: string,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = this.buildRedirectKey(shortCode);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, targetUrl, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, targetUrl);
    }
  }

  /**
   * Invalida reactivamente un enlace en caché (`DEL r:{shortCode}`).
   */
  async invalidateRedirectTarget(shortCode: string): Promise<void> {
    await this.redis.del(this.buildRedirectKey(shortCode));
  }

  /**
   * Inserta un evento analítico al inicio de la cola Redis (`LPUSH queue:clicks`).
   * @deprecated Preferir inyectar y utilizar directamente `ClickQueueService`.
   */
  async enqueueClickEvent(payload: ClickEventPayload): Promise<void> {
    if (this.clickQueueService) {
      return this.clickQueueService.enqueueClickEvent(payload);
    }
    await this.redis.lpush(CLICKS_QUEUE_KEY, JSON.stringify(payload));
  }

  /**
   * Extrae en lote hasta `batchSize` eventos del final de la cola Redis (`RPOP queue:clicks`).
   * @deprecated Preferir inyectar y utilizar directamente `ClickQueueService`.
   */
  async popClickEventsBatch(
    batchSize: number = 200,
  ): Promise<ClickEventPayload[]> {
    if (this.clickQueueService) {
      return this.clickQueueService.popClickEventsBatch(batchSize);
    }
    if (batchSize <= 0) {
      return [];
    }

    try {
      const raw = await (this.redis as any).rpop(CLICKS_QUEUE_KEY, batchSize);
      if (!raw) {
        return [];
      }
      const rawItems: string[] = Array.isArray(raw) ? raw : [raw];
      return this.parseRawQueueItems(rawItems);
    } catch {
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
   * Re-encola una lista de eventos en Redis (`LPUSH queue:clicks`) para evitar pérdida de datos
   * cuando la persistencia en PostgreSQL falla.
   */
  async reEnqueueClickEventsBatch(
    events: ClickEventPayload[],
  ): Promise<void> {
    if (this.clickQueueService) {
      return this.clickQueueService.reEnqueueBatch(events);
    }
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
   * Retorna la cantidad de eventos encolados pendientes en Redis (`LLEN queue:clicks`).
   * @deprecated Preferir inyectar y utilizar directamente `ClickQueueService`.
   */
  async getQueueLength(): Promise<number> {
    if (this.clickQueueService) {
      return this.clickQueueService.getQueueLength();
    }
    return this.redis.llen(CLICKS_QUEUE_KEY);
  }

  /**
   * Parsea cadenas JSON ignorando registros malformados de forma resiliente.
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
