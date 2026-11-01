/**
 * Token de inyección de dependencias para el repositorio analítico de eventos (`ILinkEventRepository`).
 * Implementa el Principio de Inversión de Dependencias (SOLID - DIP).
 */
export const LINK_EVENT_REPOSITORY = Symbol('LINK_EVENT_REPOSITORY');

/**
 * Totales agregados de clics y visitantes únicos dentro de una ventana temporal.
 */
export interface RawStatsTotals {
  totalClicks: number;
  uniqueVisitors: number;
}

/**
 * Punto diario de la serie temporal (`YYYY-MM-DD`).
 */
export interface RawTimelinePoint {
  date: string;
  clicks: number;
}

/**
 * Conteo agrupado por nombre (usado para `os` y `browsers`).
 */
export interface RawNamedCount {
  name: string;
  count: number;
}

/**
 * Conteo agrupado por código de país ISO-2.
 */
export interface RawCountryCount {
  code: string;
  count: number;
}

/**
 * Conteo agrupado por fuente de referencia (`referer`).
 */
export interface RawReferrerCount {
  source: string;
  count: number;
}

/**
 * Contrato de repositorio de dominio para consultas analíticas sobre `LinkEvent` (`link_events`).
 * Cada método representa una consulta agregada optimizada para aprovechar el índice compuesto
 * `idx_link_events_scanned (link_id, scanned_at DESC)`.
 */
export interface ILinkEventRepository {
  /**
   * Calcula el total de clics y visitantes únicos (`COUNT(DISTINCT ip_address)`)
   * acotado por `linkId` y `scannedAt >= startDate`.
   */
  getTotalsAndUniqueVisitors(
    linkId: string,
    startDate: Date,
  ): Promise<RawStatsTotals>;

  /**
   * Obtiene la serie temporal diaria de clics (`YYYY-MM-DD`) ordenada ascendentemente
   * acotada por `linkId` y `scannedAt >= startDate`.
   */
  getDailyTimeline(
    linkId: string,
    startDate: Date,
  ): Promise<RawTimelinePoint[]>;

  /**
   * Obtiene el top de sistemas operativos (`os`) ordenados por volumen de clics descendente.
   */
  getTopOsBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawNamedCount[]>;

  /**
   * Obtiene el top de navegadores (`browser`) ordenados por volumen de clics descendente.
   */
  getTopBrowsersBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawNamedCount[]>;

  /**
   * Obtiene el top de países (`country` ISO-2) ordenados por volumen de clics descendente.
   */
  getTopCountriesBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawCountryCount[]>;

  /**
   * Obtiene el top de fuentes de tráfico (`referer`), traduciendo nulos o cadenas vacías
   * directamente a `'Direct / QR Scan'` mediante `COALESCE(NULLIF(referer, ''), 'Direct / QR Scan')`.
   */
  getTopReferrersBreakdown(
    linkId: string,
    startDate: Date,
    limit?: number,
  ): Promise<RawReferrerCount[]>;
}
