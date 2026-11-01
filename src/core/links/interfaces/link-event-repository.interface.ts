/**
 * Token de inyección de dependencias para el repositorio analítico de eventos (`ILinkEventRepository`).
 * Implementa el Principio de Inversión de Dependencias (SOLID - DIP).
 */
export const LINK_EVENT_REPOSITORY = Symbol('LINK_EVENT_REPOSITORY');


export interface RawStatsTotals {
  totalClicks: number;
  uniqueVisitors: number;
}


export interface RawTimelinePoint {
  date: string;
  clicks: number;
}


export interface RawNamedCount {
  name: string;
  count: number;
}


export interface RawCountryCount {
  code: string;
  count: number;
}


export interface RawReferrerCount {
  source: string;
  count: number;
}


export interface CreateLinkEventRecord {
  linkId: string;
  ipAddress: string;
  userAgent: string | null;
  country: string | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
  scannedAt: Date;
}

/**
 * Contrato de repositorio de dominio para consultas analíticas sobre `LinkEvent` (`link_events`).
 * Cada método representa una consulta agregada optimizada para aprovechar el índice compuesto
 * `idx_link_events_scanned (link_id, scanned_at DESC)`.
 */
export interface ILinkEventRepository {

  getTotalsAndUniqueVisitors(
    linkId: string,
    startDate: Date,
  ): Promise<RawStatsTotals>;

  getDailyTimeline(
    linkId: string,
    startDate: Date,
  ): Promise<RawTimelinePoint[]>;


  getTopOsBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawNamedCount[]>;


  getTopBrowsersBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawNamedCount[]>;


  getTopCountriesBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawCountryCount[]>;

  getTopReferrersBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawReferrerCount[]>;


  insertBatch(events: CreateLinkEventRecord[]): Promise<void>;
}
