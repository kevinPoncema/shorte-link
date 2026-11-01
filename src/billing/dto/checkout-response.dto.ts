import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO de respuesta que contiene la URL de Stripe Checkout para redirección del cliente.
 */
export class CheckoutResponseDto {
  @ApiProperty({
    description: 'URL de Stripe Checkout hacia donde redirigir al usuario',
    example: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5...',
  })
  checkoutUrl: string;
}
