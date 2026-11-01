import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { LinkEvent } from '../../models/link-event.entity';
import {
  ILinkEventRepository,
  RawCountryCount,
  RawNamedCount,
  RawReferrerCount,
  RawStatsTotals,
  RawTimelinePoint,
} from '../interfaces/link-event-repository.interface';

export const DEFAULT_BREAKDOWN_LIMIT = 5;

/**
 * Adaptador de infraestructura TypeORM para `ILinkEventRepository`.
 * Ejecuta consultas SQL agregadas directamente sobre `link_events` aprovechando el índice
 * compuesto `(link_id, scanned_at DESC)` sin cargar filas individuales en memoria.
 */
@Injectable()
export class TypeOrmLinkEventRepository implements ILinkEventRepository {
  constructor(
    @InjectRepository(LinkEvent)
    private readonly ormRepository: Repository<LinkEvent>,
  ) {}

  async getTotalsAndUniqueVisitors(
    linkId: string,
    startDate: Date,
  ): Promise<RawStatsTotals> {
    const raw = await this.createScopedQueryBuilder(linkId, startDate)
      .select('COUNT(*)', 'totalClicks')
      .addSelect('COUNT(DISTINCT event.ip_address)', 'uniqueVisitors')
      .getRawOne<{ totalClicks?: string | number; uniqueVisitors?: string | number }>();

    return {
      totalClicks: Number(raw?.totalClicks ?? 0),
      uniqueVisitors: Number(raw?.uniqueVisitors ?? 0),
    };
  }

  async getDailyTimeline(
    linkId: string,
    startDate: Date,
  ): Promise<RawTimelinePoint[]> {
    const rows = await this.createScopedQueryBuilder(linkId, startDate)
      .select(
        "TO_CHAR(DATE_TRUNC('day', event.scanned_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')",
        'date',
      )
      .addSelect('COUNT(*)', 'clicks')
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany<{ date: string; clicks: string | number }>();

    return rows.map((row) => ({
      date: row.date,
      clicks: Number(row.clicks),
    }));
  }

  async getTopOsBreakdown(
    linkId: string,
    startDate: Date,
    limit: number = DEFAULT_BREAKDOWN_LIMIT,
  ): Promise<RawNamedCount[]> {
    const rows = await this.createScopedQueryBuilder(linkId, startDate)
      .select("COALESCE(NULLIF(event.os, ''), 'Others')", 'name')
      .addSelect('COUNT(*)', 'count')
      .groupBy('name')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<{ name: string; count: string | number }>();

    return rows.map((row) => ({
      name: row.name,
      count: Number(row.count),
    }));
  }

  async getTopBrowsersBreakdown(
    linkId: string,
    startDate: Date,
    limit: number = DEFAULT_BREAKDOWN_LIMIT,
  ): Promise<RawNamedCount[]> {
    const rows = await this.createScopedQueryBuilder(linkId, startDate)
      .select("COALESCE(NULLIF(event.browser, ''), 'Others')", 'name')
      .addSelect('COUNT(*)', 'count')
      .groupBy('name')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<{ name: string; count: string | number }>();

    return rows.map((row) => ({
      name: row.name,
      count: Number(row.count),
    }));
  }

  async getTopCountriesBreakdown(
    linkId: string,
    startDate: Date,
    limit: number = DEFAULT_BREAKDOWN_LIMIT,
  ): Promise<RawCountryCount[]> {
    const rows = await this.createScopedQueryBuilder(linkId, startDate)
      .select("UPPER(COALESCE(NULLIF(event.country, ''), 'OT'))", 'code')
      .addSelect('COUNT(*)', 'count')
      .groupBy('code')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<{ code: string; count: string | number }>();

    return rows.map((row) => ({
      code: row.code,
      count: Number(row.count),
    }));
  }

  async getTopReferrersBreakdown(
    linkId: string,
    startDate: Date,
    limit: number = DEFAULT_BREAKDOWN_LIMIT,
  ): Promise<RawReferrerCount[]> {
    const rows = await this.createScopedQueryBuilder(linkId, startDate)
      .select(
        "COALESCE(NULLIF(event.referer, ''), 'Direct / QR Scan')",
        'source',
      )
      .addSelect('COUNT(*)', 'count')
      .groupBy('source')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<{ source: string; count: string | number }>();

    return rows.map((row) => ({
      source: row.source,
      count: Number(row.count),
    }));
  }

  // ===========================================================================
  // Funciones Auxiliares de Consulta (Single Responsibility Principle)
  // ===========================================================================

  /**
   * Construye el QueryBuilder base acotado por el filtro temporal indexado:
   * `WHERE link_id = :linkId AND scanned_at >= :startDate`
   */
  private createScopedQueryBuilder(
    linkId: string,
    startDate: Date,
  ): SelectQueryBuilder<LinkEvent> {
    return this.ormRepository
      .createQueryBuilder('event')
      .where('event.link_id = :linkId AND event.scanned_at >= :startDate', {
        linkId,
        startDate,
      });
  }
}
