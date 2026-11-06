import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Parámetros opcionales de consulta para listar enlaces con paginación y filtros (`GET /links`).
 */
export class FindLinksQueryDto {
  @ApiPropertyOptional({
    description: 'Número de página a consultar (1-indexado). Opcional.',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number;

  @ApiPropertyOptional({
    description: 'Cantidad máxima de enlaces por página (1 a 100). Opcional.',
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit cannot exceed 100' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filtro por nombre o etiqueta del enlace (búsqueda parcial case-insensitive)',
    example: 'Black Friday',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filtro libre por texto (coincidencia en nombre, shortCode o targetUrl)',
    example: 'promo',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
