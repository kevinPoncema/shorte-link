import { ApiProperty } from '@nestjs/swagger';
import { Link } from '../../models/link.entity';

/**
 * Metadatos asociados al resultado de una consulta paginada.
 */
export class PaginationMetaDto {
  @ApiProperty({
    description: 'Total de registros encontrados que coinciden con los filtros aplicados',
    example: 45,
  })
  total: number;

  @ApiProperty({
    description: 'Página actual consultada (1-indexado)',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Límite de elementos solicitados por página',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total de páginas calculadas según el límite y el número de registros',
    example: 5,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Indica si existe una página siguiente disponible',
    example: true,
  })
  hasNext: boolean;

  @ApiProperty({
    description: 'Indica si existe una página anterior disponible',
    example: false,
  })
  hasPrev: boolean;
}

/**
 * Envoltorio de respuesta tipada para listados de enlaces con paginación activa.
 */
export class PaginatedLinksResponseDto {
  @ApiProperty({
    type: [Link],
    description: 'Listado de enlaces pertenecientes a la página solicitada',
  })
  data: Link[];

  @ApiProperty({
    type: PaginationMetaDto,
    description: 'Metadatos de navegación y totales de la consulta',
  })
  meta: PaginationMetaDto;
}
