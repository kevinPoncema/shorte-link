import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { QrConfig } from '../../models/link.entity';

/**
 * DTO de configuración visual y técnica para el renderizado dinámico del código QR.
 */
export class QrConfigDto implements QrConfig {
  @ApiPropertyOptional({
    description: 'Color hexadecimal de los módulos oscuros del código QR',
    example: '#000000',
    pattern: '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$',
  })
  @IsOptional()
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
    message: 'foregroundColor must be a valid hex color (e.g. #000000)',
  })
  foregroundColor?: string;

  @ApiPropertyOptional({
    description: 'Color hexadecimal del fondo del código QR',
    example: '#FFFFFF',
    pattern: '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$',
  })
  @IsOptional()
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
    message: 'backgroundColor must be a valid hex color (e.g. #FFFFFF)',
  })
  backgroundColor?: string;

  @ApiPropertyOptional({
    description: 'URL de logo SVG/PNG opcional para mostrar al centro del código QR (Plan PRO)',
    format: 'uri',
    example: 'https://cdn.empresa.com/brand-logo.svg',
  })
  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'logoUrl must be a valid HTTP or HTTPS URL' },
  )
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Formato de renderizado por defecto del código QR',
    enum: ['png', 'svg'],
    example: 'svg',
  })
  @IsOptional()
  @IsIn(['png', 'svg'])
  format?: 'png' | 'svg';

  @ApiPropertyOptional({
    description: 'Margen de zona silenciosa en módulos (0 a 10)',
    minimum: 0,
    maximum: 10,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  margin?: number;

  @ApiPropertyOptional({
    description: 'Ancho de salida de la imagen QR en píxeles (64 a 2048)',
    minimum: 64,
    maximum: 2048,
    example: 300,
  })
  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(2048)
  width?: number;

  @ApiPropertyOptional({
    description: 'Nivel de corrección de errores Reed-Solomon',
    enum: ['L', 'M', 'Q', 'H'],
    example: 'M',
  })
  @IsOptional()
  @IsIn(['L', 'M', 'Q', 'H'])
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}
