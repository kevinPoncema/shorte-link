import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  ValidateNested,
} from 'class-validator';
import { QrConfigDto } from './qr-config.dto';

/**
 * Payload de entrada para crear un nuevo enlace corto y su configuración QR (`POST /links`).
 */
export class CreateLinkDto {
  @ApiPropertyOptional({
    description: 'Nombre o etiqueta de referencia para identificar el enlace',
    example: 'Campaña Black Friday 2026',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'URL absoluta de destino original (requiere esquema http o https)',
    format: 'uri',
    example: 'https://docs.nestjs.com/techniques/performance',
  })
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'targetUrl must be a valid HTTP or HTTPS URL' },
  )
  targetUrl: string;

  @ApiPropertyOptional({
    description:
      'Slug alfanumérico personalizado opcional (6 a 16 caracteres). Si se omite, el sistema genera uno aleatorio Base62 de 7 caracteres.',
    example: 'PromoQ426',
    pattern: '^[A-Za-z0-9]{6,16}$',
    minLength: 6,
    maxLength: 16,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,16}$/, {
    message: 'shortCode must be 6 to 16 alphanumeric characters',
  })
  shortCode?: string;

  @ApiPropertyOptional({
    description:
      'Subdominio CNAME personalizado opcional (exclusivo para Plan PRO)',
    example: 'qr.miempresa.com',
  })
  @IsOptional()
  @IsString()
  customDomain?: string;

  @ApiPropertyOptional({
    description:
      'Parámetros opcionales de diseño visual para el código QR dinámico (sujeto a permisos de PlanStrategy)',
    type: () => QrConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QrConfigDto)
  qrConfig?: QrConfigDto;
}
