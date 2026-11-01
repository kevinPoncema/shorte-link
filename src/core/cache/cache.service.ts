import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const REDIRECT_KEY_PREFIX = 'r:';

export const CLICKS_QUEUE_KEY = 'queue:clicks';

export interface ClickQueuePayload {
  shortCode: string;
  linkId?: string;
  ipAddress: string;
  userAgent: string | null;
  referer: string | null;
  scannedAt: string;
}

export type ClickEventPayload = ClickQueuePayload;

/**
 * Servicio de acceso a la capa en memoria Redis (Data Plane & Analytics Queue).
 * Administra el ciclo de vida de claves `r:{shortCode}` bajo política `allkeys-lru`
 * y la emisión asíncrona hacia `queue:clicks`.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) { }

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
   * Obtiene en sub-milisegundos la URL de destino almacenada en Redis (`GET r:{shortCode}`).
   */
  async getRedirectTarget(shortCode: string): Promise<string | null> {
    return this.redis.get(this.buildRedirectKey(shortCode));
  }

  /**
   * Almacena o precalienta la URL de destino en Redis (`SET r:{shortCode} {targetUrl}`).
   */
  async setRedirectTarget(shortCode: string, targetUrl: string): Promise<void> {
    await this.redis.set(this.buildRedirectKey(shortCode), targetUrl);
  }

  /**
   * Invalida reactivamente un enlace en caché (`DEL r:{shortCode}`).
   */
  async invalidateRedirectTarget(shortCode: string): Promise<void> {
    await this.redis.del(this.buildRedirectKey(shortCode));
  }

  /**
   * Inserta un evento analítico al inicio de la cola Redis (`LPUSH queue:clicks`).
   */
  async enqueueClickEvent(payload: ClickQueuePayload): Promise<void> {
    await this.redis.lpush(CLICKS_QUEUE_KEY, JSON.stringify(payload));
  }

  /**
   * Extrae en lote hasta `batchSize` eventos del final de la cola Redis (`RPOP queue:clicks`),
   * liberando inmediatamente memoria RAM de Redis para que el worker los inserte en PostgreSQL.
   */
  async popClickEventsBatch(
    batchSize: number = 200,
  ): Promise<ClickQueuePayload[]> {
    if (batchSize <= 0) {
      return [];
    }

    try {
      // Intento con RPOP multi-elemento soportado nativamente en Redis 6.2+
      const raw = await (this.redis as any).rpop(CLICKS_QUEUE_KEY, batchSize);
      if (!raw) {
        return [];
      }
      const rawItems: string[] = Array.isArray(raw) ? raw : [raw];
      return this.parseRawQueueItems(rawItems);
    } catch {
      // Fallback para Redis < 6.2 o mocks de pruebas unitarias
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
   * Parsea cadenas JSON ignorando registros malformados de forma resiliente.
   */
  private parseRawQueueItems(rawItems: string[]): ClickQueuePayload[] {
    const valid: ClickQueuePayload[] = [];
    for (const raw of rawItems) {
      try {
        const item = JSON.parse(raw) as ClickQueuePayload;
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
