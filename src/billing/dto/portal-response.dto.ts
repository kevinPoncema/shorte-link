import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO de respuesta con la URL del Stripe Customer Portal.
 */
export class PortalResponseDto {
  @ApiProperty({
    description: 'URL de Stripe Customer Portal para gestión de suscripción y métodos de pago',
    example: 'https://billing.stripe.com/p/session/test_123456...',
  })
  url: string;
}
