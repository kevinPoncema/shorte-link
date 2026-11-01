import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUrl, ValidateNested } from 'class-validator';
import { QrConfigDto } from './qr-config.dto';

/**
 * Payload de actualización parcial de un enlace corto (`PATCH /links/:id`).
 * Toda actualización ejecuta invalidación reactiva `DEL r:{shortCode}` en Redis.
 */
export class UpdateLinkDto {
  @ApiPropertyOptional({
    description: 'Nombre o etiqueta de referencia para identificar el enlace',
    example: 'Campaña Black Friday 2026',
    maxLength: 150,
  })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Nueva URL absoluta de destino (HTTP/HTTPS) para el QR dinámico',
    format: 'uri',
    example: 'https://fastify.dev/docs/latest',
  })
  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'targetUrl must be a valid HTTP or HTTPS URL' },
  )
  targetUrl?: string;

  @ApiPropertyOptional({
    description:
      'Activa o desactiva la resolución pública del enlace en el Fast-Path',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Parámetros parciales de diseño QR a fusionar en `qrConfig`',
    type: () => QrConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QrConfigDto)
  qrConfig?: QrConfigDto;
}
