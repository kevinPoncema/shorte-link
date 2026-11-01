import { ApiProperty } from '@nestjs/swagger';

/**
 * Resumen ejecutivo de métricas del enlace en el periodo consultado.
 */
export class StatsSummaryDto {
  @ApiProperty({
    description: 'Total de clics o escaneos registrados en el periodo',
    example: 1420,
  })
  totalClicks: number;

  @ApiProperty({
    description: 'Visitantes únicos estimados por huella IP anonimizada',
    example: 985,
  })
  uniqueVisitors: number;

  @ApiProperty({
    description: 'Código ISO-2 del país con mayor tráfico en el periodo',
    example: 'HN',
    nullable: true,
    type: String,
  })
  topCountry: string | null;

  @ApiProperty({
    description: 'Sistema operativo o dispositivo predominante en el periodo',
    example: 'iOS',
    nullable: true,
    type: String,
  })
  topDevice: string | null;
}

/**
 * Punto diario en la serie temporal de clics.
 */
export class TimelinePointDto {
  @ApiProperty({
    description: 'Fecha en formato ISO YYYY-MM-DD',
    example: '2026-10-25',
  })
  date: string;

  @ApiProperty({
    description: 'Cantidad de clics registrados en la fecha indicada',
    example: 140,
  })
  clicks: number;
}

/**
 * Entrada de desglose porcentual por nombre (usada en `os` y `browsers`).
 */
export class NamedBreakdownItemDto {
  @ApiProperty({
    description: 'Nombre del sistema operativo o navegador (o "Others")',
    example: 'iOS',
  })
  name: string;

  @ApiProperty({
    description: 'Total de eventos en esta categoría',
    example: 850,
  })
  count: number;

  @ApiProperty({
    description: 'Porcentaje respecto al total de clics (redondeado a 2 decimales)',
    example: 59.86,
  })
  percentage: number;
}

/**
 * Entrada de desglose porcentual por país (`countries`).
 */
export class CountryBreakdownItemDto {
  @ApiProperty({
    description: 'Código ISO-2 del país (o "OT" para Others)',
    example: 'HN',
  })
  code: string;

  @ApiProperty({
    description: 'Nombre legible del país en inglés (o "Others")',
    example: 'Honduras',
  })
  name: string;

  @ApiProperty({
    description: 'Total de clics originados desde este país',
    example: 1250,
  })
  count: number;

  @ApiProperty({
    description: 'Porcentaje respecto al total de clics (redondeado a 2 decimales)',
    example: 88.03,
  })
  percentage: number;
}

/**
 * Entrada de desglose porcentual por fuente de referencia (`referrers`).
 */
export class ReferrerBreakdownItemDto {
  @ApiProperty({
    description: 'Fuente de origen ("Direct / QR Scan", dominio o "others")',
    example: 'Direct / QR Scan',
  })
  source: string;

  @ApiProperty({
    description: 'Total de clics provenientes de esta fuente',
    example: 1150,
  })
  count: number;

  @ApiProperty({
    description: 'Porcentaje respecto al total de clics (redondeado a 2 decimales)',
    example: 80.99,
  })
  percentage: number;
}

/**
 * Agrupación de desgloses analíticos por dimensión.
 */
export class StatsBreakdownsDto {
  @ApiProperty({
    description: 'Distribución por sistema operativo (Top + Others)',
    type: () => [NamedBreakdownItemDto],
  })
  os: NamedBreakdownItemDto[];

  @ApiProperty({
    description: 'Distribución por navegador (Top + Others)',
    type: () => [NamedBreakdownItemDto],
  })
  browsers: NamedBreakdownItemDto[];

  @ApiProperty({
    description: 'Distribución geográfica por país (Top + OT/Others)',
    type: () => [CountryBreakdownItemDto],
  })
  countries: CountryBreakdownItemDto[];

  @ApiProperty({
    description: 'Distribución por fuente de tráfico o Referer (Top + others)',
    type: () => [ReferrerBreakdownItemDto],
  })
  referrers: ReferrerBreakdownItemDto[];
}

/**
 * Respuesta consolidada de estadísticas de un enlace (`GET /links/:id/stats`).
 */
export class LinkStatsResponseDto {
  @ApiProperty({
    description: 'Identificador UUID v4 del enlace consultado',
    format: 'uuid',
    example: 'b1b22e11-897c-48c9-9eb1-8848db929c8e',
  })
  linkId: string;

  @ApiProperty({
    description: 'Periodo efectivo aplicado según el plan del usuario (ej. "7d", "30d", "365d")',
    example: '7d',
  })
  period: string;

  @ApiProperty({
    description: 'Métricas globales de resumen en la ventana de tiempo',
    type: () => StatsSummaryDto,
  })
  summary: StatsSummaryDto;

  @ApiProperty({
    description: 'Serie de tiempo diaria de clics',
    type: () => [TimelinePointDto],
  })
  timeline: TimelinePointDto[];

  @ApiProperty({
    description: 'Desgloses porcentuales por OS, navegador, país y referer',
    type: () => StatsBreakdownsDto,
  })
  breakdowns: StatsBreakdownsDto;
}
