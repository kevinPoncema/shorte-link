import { ApiProperty } from '@nestjs/swagger';
import { Subscription } from '../models/subscription.entity';

/**
 * DTO de respuesta para la consulta del estado de suscripción actual del usuario.
 */
export class SubscriptionResponseDto {
  @ApiProperty({
    description:
      'Suscripción activa asociada a la cuenta o `null` si el usuario opera bajo el plan por defecto sin pasarela vinculada',
    type: () => Subscription,
    nullable: true,
  })
  subscription: Subscription | null;
}
