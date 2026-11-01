import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanContextService } from '../../../plans/services/plan-context.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  CountryBreakdownItemDto,
  LinkStatsResponseDto,
  NamedBreakdownItemDto,
  ReferrerBreakdownItemDto,
  StatsBreakdownsDto,
  StatsSummaryDto,
  TimelinePointDto,
} from '../dto/link-stats-response.dto';
import {
  ILinkEventRepository,
  LINK_EVENT_REPOSITORY,
  RawCountryCount,
  RawNamedCount,
  RawReferrerCount,
  RawStatsTotals,
  RawTimelinePoint,
} from '../interfaces/link-event-repository.interface';
import {
  ILinkRepository,
  LINK_REPOSITORY,
} from '../interfaces/link-repository.interface';

export const DEFAULT_STATS_PERIOD_DAYS = 7;
export const TOP_BREAKDOWN_QUERY_LIMIT = 5;

const COUNTRY_NAMES_FALLBACK: Record<string, string> = {
  HN: 'Honduras',
  US: 'United States',
  ES: 'Spain',
  MX: 'Mexico',
  GT: 'Guatemala',
  SV: 'El Salvador',
  NI: 'Nicaragua',
  CR: 'Costa Rica',
  PA: 'Panama',
  CO: 'Colombia',
  AR: 'Argentina',
  CL: 'Chile',
  PE: 'Peru',
  BR: 'Brazil',
  CA: 'Canada',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  OT: 'Others',
};

interface AnalyticsWindow {
  periodLabel: string;
  days: number;
  startDate: Date;
}

interface RawAggregationsBundle {
  totals: RawStatsTotals;
  timeline: RawTimelinePoint[];
  os: RawNamedCount[];
  browsers: RawNamedCount[];
  countries: RawCountryCount[];
  referrers: RawReferrerCount[];
}

/**
 * Servicio de dominio para estadísticas y analíticas de enlaces (`LinkStatsService`).
 * Implementa el patrón **Orquestador** y los principios **SOLID** (SRP, DIP),
 * coordinando múltiples consultas agregadas del repositorio `ILinkEventRepository`
 * acotadas por la ventana temporal permitida en la `PlanStrategy` del usuario.
 */
@Injectable()
export class LinkStatsService {
  private readonly regionDisplayNames = new Intl.DisplayNames(['en'], {
    type: 'region',
  });

  constructor(
    @Inject(LINK_REPOSITORY)
    private readonly linkRepository: ILinkRepository,
    @Inject(LINK_EVENT_REPOSITORY)
    private readonly linkEventRepository: ILinkEventRepository,
    private readonly planContextService: PlanContextService,
  ) {}

  /**
   * **Orquestador de Estadísticas de un Enlace (`GET /links/:id/stats`):**
   * 1. Verifica que el enlace exista y pertenezca al usuario autenticado (prevención IDOR).
   * 2. Resuelve la ventana temporal efectiva acotada por el plan (`STARTER`: máx 7d, `PRO`: máx 365d).
   * 3. Ejecuta en paralelo las consultas agregadas del repositorio (`totals`, `timeline`, `os`, `browsers`, `countries`, `referrers`).
   * 4. Construye el resumen ejecutivo (`totalClicks`, `uniqueVisitors`, `topCountry`, `topDevice`).
   * 5. Construye la serie temporal diaria (`timeline`).
   * 6. Calcula los desgloses porcentuales agrupando el excedente bajo `"Others"` / `"OT"` / `"others"`.
   */
  async getLinkStats(
    user: JwtPayload,
    linkId: string,
    requestedPeriod?: string,
  ): Promise<LinkStatsResponseDto> {
    await this.assertUserOwnsLink(user.sub, linkId);

    const window = this.resolveAnalyticsWindow(user.plan, requestedPeriod);
    const rawData = await this.fetchAllAggregations(linkId, window.startDate);

    const summary = this.buildSummary(
      rawData.totals,
      rawData.countries,
      rawData.os,
    );
    const timeline = this.buildTimeline(rawData.timeline);
    const breakdowns = this.buildBreakdowns(rawData);

    return {
      linkId,
      period: window.periodLabel,
      summary,
      timeline,
      breakdowns,
    };
  }

  // ===========================================================================
  // Funciones Auxiliares de Dominio (Single Responsibility Principle)
  // ===========================================================================

  /**
   * Verifica que el enlace exista y pertenezca al usuario solicitante.
   */
  private async assertUserOwnsLink(
    userId: string,
    linkId: string,
  ): Promise<void> {
    const link = await this.linkRepository.findByIdAndUser(linkId, userId);
    if (!link) {
      throw new NotFoundException('Link not found');
    }
  }

  /**
   * Calcula la ventana de tiempo aplicando el límite de retención del plan (`getAnalyticsRetentionDays()`).
   */
  private resolveAnalyticsWindow(
    planCode?: string,
    requestedPeriod?: string,
  ): AnalyticsWindow {
    const strategy = this.planContextService.getStrategy(planCode);
    const maxRetentionDays = strategy.getAnalyticsRetentionDays();
    const requestedDays = this.parseRequestedPeriodDays(requestedPeriod);

    const effectiveDays = Math.min(requestedDays, maxRetentionDays);
    const startDate = new Date(
      Date.now() - effectiveDays * 24 * 60 * 60 * 1000,
    );

    return {
      periodLabel: `${effectiveDays}d`,
      days: effectiveDays,
      startDate,
    };
  }

  /**
   * Parsea un parámetro opcional de periodo como `'7d'`, `'30d'`, `'90d'`, `'365d'`.
   */
  private parseRequestedPeriodDays(requestedPeriod?: string): number {
    if (!requestedPeriod || requestedPeriod.trim().length === 0) {
      return DEFAULT_STATS_PERIOD_DAYS;
    }

    const match = /^(\d+)d$/i.exec(requestedPeriod.trim());
    if (!match) {
      throw new BadRequestException(
        'Invalid period format. Expected format like "7d", "30d", or "365d"',
      );
    }

    const days = Number(match[1]);
    if (days < 1 || days > 365) {
      throw new BadRequestException('period must be between 1d and 365d');
    }

    return days;
  }

  /**
   * Dispara en paralelo todas las funciones de agregación del repositorio de eventos.
   */
  private async fetchAllAggregations(
    linkId: string,
    startDate: Date,
  ): Promise<RawAggregationsBundle> {
    const [totals, timeline, os, browsers, countries, referrers] =
      await Promise.all([
        this.linkEventRepository.getTotalsAndUniqueVisitors(linkId, startDate),
        this.linkEventRepository.getDailyTimeline(linkId, startDate),
        this.linkEventRepository.getTopOsBreakdown(
          linkId,
          startDate,
          TOP_BREAKDOWN_QUERY_LIMIT,
        ),
        this.linkEventRepository.getTopBrowsersBreakdown(
          linkId,
          startDate,
          TOP_BREAKDOWN_QUERY_LIMIT,
        ),
        this.linkEventRepository.getTopCountriesBreakdown(
          linkId,
          startDate,
          TOP_BREAKDOWN_QUERY_LIMIT,
        ),
        this.linkEventRepository.getTopReferrersBreakdown(
          linkId,
          startDate,
          TOP_BREAKDOWN_QUERY_LIMIT,
        ),
      ]);

    return {
      totals,
      timeline,
      os,
      browsers,
      countries,
      referrers,
    };
  }

  /**
   * Construye el objeto `summary` identificando el país y dispositivo líder.
   */
  private buildSummary(
    totals: RawStatsTotals,
    countries: RawCountryCount[],
    os: RawNamedCount[],
  ): StatsSummaryDto {
    if (totals.totalClicks === 0) {
      return {
        totalClicks: 0,
        uniqueVisitors: 0,
        topCountry: null,
        topDevice: null,
      };
    }

    const topCountryRow =
      countries.find((c) => c.code !== 'OT') ?? countries[0] ?? null;
    const topOsRow = os.find((o) => o.name !== 'Others') ?? os[0] ?? null;

    return {
      totalClicks: totals.totalClicks,
      uniqueVisitors: totals.uniqueVisitors,
      topCountry: topCountryRow ? topCountryRow.code : null,
      topDevice: topOsRow ? topOsRow.name : null,
    };
  }

  /**
   * Normaliza la serie temporal diaria ordenada ascendentemente.
   */
  private buildTimeline(rawTimeline: RawTimelinePoint[]): TimelinePointDto[] {
    return rawTimeline.map((point) => ({
      date: point.date,
      clicks: point.clicks,
    }));
  }

  /**
   * Orquesta la construcción de los 4 desgloses analíticos (`os`, `browsers`, `countries`, `referrers`).
   */
  private buildBreakdowns(raw: RawAggregationsBundle): StatsBreakdownsDto {
    const totalClicks = raw.totals.totalClicks;

    return {
      os: this.buildNamedBreakdown(raw.os, totalClicks),
      browsers: this.buildNamedBreakdown(raw.browsers, totalClicks),
      countries: this.buildCountryBreakdown(raw.countries, totalClicks),
      referrers: this.buildReferrerBreakdown(raw.referrers, totalClicks),
    };
  }

  /**
   * Construye el desglose para `os` o `browsers` sumando el resto bajo la etiqueta `"Others"`.
   */
  private buildNamedBreakdown(
    rows: RawNamedCount[],
    totalClicks: number,
  ): NamedBreakdownItemDto[] {
    if (totalClicks <= 0 || rows.length === 0) {
      return [];
    }

    const topItems = rows.filter(
      (r) => r.name.toLowerCase() !== 'others' && r.count > 0,
    );
    const sumTop = topItems.reduce((sum, item) => sum + item.count, 0);
    const othersCount = Math.max(0, totalClicks - sumTop);

    const result: NamedBreakdownItemDto[] = topItems.map((item) => ({
      name: item.name,
      count: item.count,
      percentage: this.calculatePercentage(item.count, totalClicks),
    }));

    if (othersCount > 0) {
      result.push({
        name: 'Others',
        count: othersCount,
        percentage: this.calculateRemainderPercentage(
          result.map((r) => r.percentage),
        ),
      });
    }

    return result;
  }

  /**
   * Construye el desglose geográfico para `countries` traduciendo el código ISO-2 a nombre
   * y agrupando el resto bajo `{ code: 'OT', name: 'Others' }`.
   */
  private buildCountryBreakdown(
    rows: RawCountryCount[],
    totalClicks: number,
  ): CountryBreakdownItemDto[] {
    if (totalClicks <= 0 || rows.length === 0) {
      return [];
    }

    const topItems = rows.filter(
      (r) => r.code.toUpperCase() !== 'OT' && r.count > 0,
    );
    const sumTop = topItems.reduce((sum, item) => sum + item.count, 0);
    const othersCount = Math.max(0, totalClicks - sumTop);

    const result: CountryBreakdownItemDto[] = topItems.map((item) => {
      const code = item.code.toUpperCase();
      return {
        code,
        name: this.resolveCountryName(code),
        count: item.count,
        percentage: this.calculatePercentage(item.count, totalClicks),
      };
    });

    if (othersCount > 0) {
      result.push({
        code: 'OT',
        name: 'Others',
        count: othersCount,
        percentage: this.calculateRemainderPercentage(
          result.map((r) => r.percentage),
        ),
      });
    }

    return result;
  }

  /**
   * Construye el desglose de fuentes de referencia (`referrers`) agrupando el resto bajo `"others"`.
   */
  private buildReferrerBreakdown(
    rows: RawReferrerCount[],
    totalClicks: number,
  ): ReferrerBreakdownItemDto[] {
    if (totalClicks <= 0 || rows.length === 0) {
      return [];
    }

    const topItems = rows.filter(
      (r) => r.source.toLowerCase() !== 'others' && r.count > 0,
    );
    const sumTop = topItems.reduce((sum, item) => sum + item.count, 0);
    const othersCount = Math.max(0, totalClicks - sumTop);

    const result: ReferrerBreakdownItemDto[] = topItems.map((item) => ({
      source: item.source,
      count: item.count,
      percentage: this.calculatePercentage(item.count, totalClicks),
    }));

    if (othersCount > 0) {
      result.push({
        source: 'others',
        count: othersCount,
        percentage: this.calculateRemainderPercentage(
          result.map((r) => r.percentage),
        ),
      });
    }

    return result;
  }

  /**
   * Resuelve el nombre en inglés de un código de país ISO-2 (ej. `'HN'` -> `'Honduras'`).
   */
  private resolveCountryName(code: string): string {
    const upper = code.toUpperCase();
    if (COUNTRY_NAMES_FALLBACK[upper]) {
      return COUNTRY_NAMES_FALLBACK[upper];
    }

    try {
      return this.regionDisplayNames.of(upper) ?? upper;
    } catch {
      return upper;
    }
  }

  /**
   * Calcula el porcentaje sobre el total redondeado a 2 decimales.
   */
  private calculatePercentage(count: number, total: number): number {
    if (total <= 0) {
      return 0;
    }
    return Number(((count / total) * 100).toFixed(2));
  }

  /**
   * Calcula el porcentaje de la categoría residual ("Others") garantizando que la suma total sea 100%.
   */
  private calculateRemainderPercentage(topPercentages: number[]): number {
    if (topPercentages.length === 0) {
      return 100;
    }
    const sumTop = topPercentages.reduce((acc, p) => acc + p, 0);
    return Number(Math.max(0, 100 - sumTop).toFixed(2));
  }
}
