import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
import { JWT_BEARER_AUTH } from '../../openapi.config';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { BillingService } from '../services/billing.service';

/**
 * Controlador autenticado para consulta de estado de suscripción (`/billing`).
 */
@ApiTags('Billing')
@ApiBearerAuth(JWT_BEARER_AUTH)
@ApiUnauthorizedResponse({
  description: 'Token JWT ausente, malformado, inválido o expirado',
})
@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Retorna el registro de suscripción vinculado al usuario autenticado o `null`.
   */
  @Get('subscription')
  @ApiOperation({
    summary: 'Consultar suscripción actual del usuario autenticado',
    description:
      'Devuelve la entidad `Subscription` asociada al usuario o `null` cuando aún no tiene suscripción externa registrada.',
  })
  @ApiOkResponse({
    description: 'Estado actual de la suscripción del usuario',
    type: SubscriptionResponseDto,
  })
  async getCurrentSubscription(
    @CurrentUser() user: JwtPayload,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.billingService.findByUserId(user.sub);
    return { subscription };
  }
}
