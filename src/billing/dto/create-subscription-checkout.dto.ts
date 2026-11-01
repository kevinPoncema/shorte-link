import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * DTO para iniciar una sesión de pago recurrente en Stripe Checkout (`POST /billing/checkout/subscription`).
 */
export class CreateSubscriptionCheckoutDto {
  /**
   * Identificador del precio o plan en Stripe (`price_...`).
   * Si se omite, se utiliza el valor por defecto configurado en `STRIPE_PRO_PRICE_ID`.
   */
  @ApiPropertyOptional({
    description: 'Identificador del precio en Stripe (ej. price_1OtXYZ...)',
    example: 'price_1OtXYZ1234567890',
  })
  @IsString()
  @IsOptional()
  priceId?: string;

  /**
   * URL hacia donde redirigir al usuario tras completar el checkout con éxito.
   */
  @ApiProperty({
    description: 'URL de redirección tras completar el pago con éxito',
    example: 'https://midominio.com/dashboard?payment=success',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  successUrl: string;

  /**
   * URL hacia donde redirigir al usuario si cancela o abandona el checkout.
   */
  @ApiProperty({
    description: 'URL de redirección si el usuario cancela la sesión de pago',
    example: 'https://midominio.com/dashboard?payment=cancelled',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  cancelUrl: string;
}
