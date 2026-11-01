import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';
import { ClickQueuePayload } from '../interfaces/click-event.interface';
import {
  CreateLinkEventRecord,
  ILinkEventRepository,
  LINK_EVENT_REPOSITORY,
} from '../interfaces/link-event-repository.interface';
import {
  ILinkRepository,
  LINK_REPOSITORY,
} from '../interfaces/link-repository.interface';

export const DEFAULT_WORKER_INTERVAL_MS = 15_000;
export const DEFAULT_WORKER_BATCH_SIZE = 200;

/**
 * Worker en segundo plano para el procesamiento periódico de analíticas (`AnalyticsWorkerService`).
 *
 * **Patrón Orquestador & SOLID:**
 * Cada 15 segundos extrae en lote eventos desde la cola Redis `queue:clicks` (vaciando RAM),
 * resuelve los `link_id` faltantes, parsea el `User-Agent` (OS, Navegador) y ejecuta una inserción
 * masiva (*Bulk Insert*) atómica en PostgreSQL (`link_events`).
 */
@Injectable()
export class AnalyticsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /** Caché en memoria para evitar consultas recurrentes de `shortCode` -> `linkId`. */
  private readonly shortCodeToIdCache = new Map<string, string>();

  constructor(
    private readonly cacheService: CacheService,
    @Inject(LINK_REPOSITORY)
    private readonly linkRepository: ILinkRepository,
    @Inject(LINK_EVENT_REPOSITORY)
    private readonly linkEventRepository: ILinkEventRepository,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const isEnabled =
      this.configService.get<string>('ANALYTICS_WORKER_ENABLED', 'true') !==
      'false';

    if (!isEnabled) {
      this.logger.log('Analytics Worker is disabled by configuration.');
      return;
    }

    const intervalMs = Number(
      this.configService.get<number>(
        'ANALYTICS_WORKER_INTERVAL_MS',
        DEFAULT_WORKER_INTERVAL_MS,
      ),
    );

    this.timer = setInterval(() => {
      void this.runCycle();
    }, intervalMs);

    this.logger.log(
      `Analytics Worker initialized. Running every ${intervalMs / 1000}s consuming queue:clicks`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Flush de apagado limpio: vaciar eventos restantes en Redis antes del cierre
    try {
      await this.processBatch();
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to flush pending clicks during shutdown: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Ciclo periódico ejecutado por el timer evitando solapamiento concurrente.
   */
  async runCycle(): Promise<number> {
    if (this.isProcessing) {
      this.logger.debug(
        'Previous batch processing is still in progress, skipping tick.',
      );
      return 0;
    }

    this.isProcessing = true;
    try {
      return await this.processBatch();
    } catch (error: unknown) {
      this.logger.error(
        `Unhandled error in analytics worker batch: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  // ===========================================================================
  // Orquestador Principal (Batch Ingestion Orchestrator)
  // ===========================================================================

  /**
   * **Orquestador de Consumo y Descarga de Métricas a PostgreSQL:**
   * 1. Extrae en lote eventos desde Redis (`RPOP queue:clicks`) liberando memoria RAM.
   * 2. Si la cola está vacía, finaliza el ciclo en 0 ms.
   * 3. Resuelve los `link_id` correspondientes a los `shortCode` procesados.
   * 4. Transforma y enriquece cada evento (parseo de OS, navegador y fechas).
   * 5. Inserta en bloque el lote enriquecido en PostgreSQL (`link_events`).
   *
   * @param batchSize Tamaño máximo del lote a extraer.
   * @returns Cantidad de eventos persistidos en la base de datos.
   */
  async processBatch(batchSizeOverride?: number): Promise<number> {
    const batchSize =
      batchSizeOverride ??
      Number(
        this.configService.get<number>(
          'ANALYTICS_WORKER_BATCH_SIZE',
          DEFAULT_WORKER_BATCH_SIZE,
        ),
      );

    const rawEvents = await this.dequeueEvents(batchSize);
    if (rawEvents.length === 0) {
      return 0;
    }

    const linkIdMap = await this.resolveLinkIds(rawEvents);
    const recordsToInsert = this.transformEventsToEntities(rawEvents, linkIdMap);

    if (recordsToInsert.length === 0) {
      this.logger.warn(
        `Discarded ${rawEvents.length} events because no matching link IDs were found in DB.`,
      );
      return 0;
    }

    try {
      await this.persistBatch(recordsToInsert);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to persist ${recordsToInsert.length} click events in PostgreSQL: ${(err as Error).message}. Re-enqueueing into Redis to prevent data loss.`,
        (err as Error).stack,
      );
      try {
        if (typeof this.cacheService.reEnqueueClickEventsBatch === 'function') {
          await this.cacheService.reEnqueueClickEventsBatch(rawEvents);
        }
      } catch (reEnqueueErr: unknown) {
        this.logger.error(
          `Critical error: Failed to re-enqueue click events into Redis: ${(reEnqueueErr as Error).message}`,
        );
      }
      throw err;
    }

    this.logger.log(
      `Flushed ${recordsToInsert.length} click events from Redis RAM into PostgreSQL link_events.`,
    );

    return recordsToInsert.length;
  }

  // ===========================================================================
  // Funciones Auxiliares de Dominio (Single Responsibility Principle)
  // ===========================================================================

  /**
   * Extrae en lote hasta `batchSize` eventos del final de la cola Redis.
   */
  private async dequeueEvents(batchSize: number): Promise<ClickQueuePayload[]> {
    return this.cacheService.popClickEventsBatch(batchSize);
  }

  /**
   * Resuelve el mapa `shortCode -> linkId` combinando la caché en memoria y consultas
   * agrupadas a PostgreSQL para los slugs desconocidos.
   */
  private async resolveLinkIds(
    events: ClickQueuePayload[],
  ): Promise<Map<string, string>> {
    const resultMap = new Map<string, string>();
    const missingSlugs = new Set<string>();

    for (const event of events) {
      if (event.linkId) {
        resultMap.set(event.shortCode, event.linkId);
        this.shortCodeToIdCache.set(event.shortCode, event.linkId);
      } else {
        const cachedId = this.shortCodeToIdCache.get(event.shortCode);
        if (cachedId) {
          resultMap.set(event.shortCode, cachedId);
        } else {
          missingSlugs.add(event.shortCode);
        }
      }
    }

    if (missingSlugs.size > 0) {
      const dbLinks = await this.linkRepository.findIdsByShortCodes(
        Array.from(missingSlugs),
      );
      for (const link of dbLinks) {
        resultMap.set(link.shortCode, link.id);
        this.shortCodeToIdCache.set(link.shortCode, link.id);
      }
    }

    return resultMap;
  }

  /**
   * Transforma y enriquece los eventos crudos con metadatos derivados (OS, navegador, país).
   */
  private transformEventsToEntities(
    rawEvents: ClickQueuePayload[],
    linkIdMap: Map<string, string>,
  ): CreateLinkEventRecord[] {
    const records: CreateLinkEventRecord[] = [];

    for (const event of rawEvents) {
      const linkId = event.linkId || linkIdMap.get(event.shortCode);
      if (!linkId) {
        continue;
      }

      const os = this.parseOperatingSystem(event.userAgent);
      const browser = this.parseBrowser(event.userAgent);
      const scannedAt = this.parseScannedAt(event.scannedAt);

      records.push({
        linkId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent ?? null,
        country: event.country ? event.country.trim().toUpperCase() : null,
        os,
        browser,
        referer: event.referer ? event.referer.trim() : null,
        scannedAt,
      });
    }

    return records;
  }

  /**
   * Ejecuta el *Bulk Insert* en la tabla `link_events` mediante el repositorio.
   */
  private async persistBatch(
    records: CreateLinkEventRecord[],
  ): Promise<void> {
    await this.linkEventRepository.insertBatch(records);
  }

  /**
   * Detecta el sistema operativo a partir del User-Agent.
   */
  private parseOperatingSystem(userAgent: string | null): string {
    if (!userAgent) {
      return 'Others';
    }

    switch (true) {
      case /iPhone|iPad|iPod/i.test(userAgent):
        return 'iOS';
      case /Android/i.test(userAgent):
        return 'Android';
      case /Windows NT/i.test(userAgent):
        return 'Windows';
      case /Mac OS X|Macintosh/i.test(userAgent):
        return 'macOS';
      case /Linux/i.test(userAgent):
        return 'Linux';
      default:
        return 'Others';
    }
  }

  /**
   * Detecta el navegador web o lector a partir del User-Agent.
   */
  private parseBrowser(userAgent: string | null): string {
    if (!userAgent) {
      return 'Others';
    }

    switch (true) {
      case /Version\/.*Mobile.*Safari|iPhone.*Safari|iPad.*Safari/i.test(
        userAgent,
      ):
        return 'Mobile Safari';
      case /Chrome\/.*Mobile|CriOS/i.test(userAgent):
        return 'Chrome Mobile';
      case /Edg\/|EdgA\/|Edge\//i.test(userAgent):
        return 'Edge';
      case /Firefox\/|FxiOS\//i.test(userAgent):
        return 'Firefox';
      case /Chrome\/|Chromium\//i.test(userAgent):
        return 'Chrome';
      case /Safari\//i.test(userAgent) && !/Chrome/i.test(userAgent):
        return 'Safari';
      default:
        return 'Others';
    }
  }

  /**
   * Parsea la marca de tiempo de forma segura.
   */
  private parseScannedAt(dateString?: string): Date {
    if (!dateString) {
      return new Date();
    }
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}
