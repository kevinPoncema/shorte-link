import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * DTO para confirmar el pago desde la interfaz interactiva de Stripe Checkout Sandbox
 * cuando el entorno utiliza credenciales de prueba locales (`sk_test_51Mock...`).
 */
export class CompleteSandboxCheckoutDto {
  @ApiProperty({
    description: 'Modo de la sesión de Checkout a confirmar',
    enum: ['subscription', 'payment'],
    example: 'subscription',
  })
  @IsString()
  @IsIn(['subscription', 'payment'])
  mode!: 'subscription' | 'payment';

  @ApiPropertyOptional({
    description: 'UUID de la orden física cuando mode es payment',
    example: 'c4190ada-536e-455f-981e-04f19b69725b',
  })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Identificador de sesión sandbox generada',
    example: 'cs_sandbox_sub_1730419200',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
