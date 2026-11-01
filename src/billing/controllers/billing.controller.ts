import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
import { JWT_BEARER_AUTH } from '../../openapi.config';
import { CheckoutResponseDto } from '../dto/checkout-response.dto';
import { CompleteSandboxCheckoutDto } from '../dto/complete-sandbox-checkout.dto';
import { CreatePhysicalOrderCheckoutDto } from '../dto/create-physical-order-checkout.dto';
import { CreateSubscriptionCheckoutDto } from '../dto/create-subscription-checkout.dto';
import { PortalResponseDto } from '../dto/portal-response.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { TogglePhysicalOrdersDto } from '../dto/toggle-physical-orders.dto';
import { BillingService } from '../services/billing.service';

/**
 * Controlador de facturación y pagos (`/billing`).
 * Expone endpoints para suscripciones recurrentes SaaS, compra de insumos físicos (Feature-Flagged),
 * acceso al Stripe Customer Portal y recepción de Webhooks idempotentes.
 */
@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Obtiene el estado de configuración y Feature Flags activos del módulo de facturación.
   */
  @Get('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Consultar configuración y Feature Flags de facturación',
    description:
      'Retorna si el módulo de pedidos físicos está activo (`physicalOrdersEnabled`), precios de hardware y disponibilidad de Stripe.',
  })
  @ApiOkResponse({
    description: 'Estado de configuración de facturación y pedidos físicos',
  })
  getBillingConfig() {
    return this.billingService.getBillingConfig();
  }

  /**
   * Activa o desactiva mediante un flag booleano el módulo de pedidos físicos.
   */
  @Patch('config/physical-orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Activar o desactivar módulo de pedidos físicos (Feature Flag booleano)',
    description:
      'Permite conmutar el flag booleano `physicalOrdersEnabled` (`true` / `false`) en tiempo de ejecución.',
  })
  @ApiOkResponse({
    description: 'Flag booleano de pedidos físicos actualizado',
  })
  togglePhysicalOrders(@Body() dto: TogglePhysicalOrdersDto) {
    return this.billingService.setPhysicalOrdersEnabled(dto.enabled);
  }

  /**
   * Consulta la suscripción actual vinculada al usuario autenticado.
   */
  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Consultar suscripción actual del usuario autenticado',
    description:
      'Devuelve la entidad `Subscription` asociada al usuario o `null` cuando no tiene suscripción externa registrada.',
  })
  @ApiOkResponse({
    description: 'Estado actual de la suscripción del usuario',
    type: SubscriptionResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token JWT ausente, malformado, inválido o expirado',
  })
  async getCurrentSubscription(
    @CurrentUser() user: JwtPayload,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.billingService.findByUserId(user.sub);
    return { subscription };
  }

  /**
   * Inicia el proceso de suscripción SaaS generando una sesión de Stripe Checkout.
   */
  @Post('checkout/subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Iniciar suscripción SaaS recurrente',
    description:
      'Crea una sesión de Stripe Checkout en modo `subscription` y retorna la URL para redirección del cliente.',
  })
  @ApiOkResponse({
    description: 'Sesión de Checkout generada exitosamente',
    type: CheckoutResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o precio de suscripción no configurado',
  })
  @ApiUnauthorizedResponse({
    description: 'Token JWT no proporcionado o inválido',
  })
  async createSubscriptionCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSubscriptionCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.billingService.createSubscriptionCheckout(user, dto);
  }

  /**
   * Genera una sesión de Stripe Customer Portal para administrar medios de pago y suscripción.
   */
  @Get('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Acceso a Stripe Customer Portal',
    description:
      'Genera una sesión temporal en Stripe Billing Portal para que el cliente gestione su suscripción o métodos de pago.',
  })
  @ApiOkResponse({
    description: 'URL de Stripe Customer Portal',
    type: PortalResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El usuario no posee una cuenta de facturación registrada',
  })
  @ApiUnauthorizedResponse({
    description: 'Token JWT no proporcionado o inválido',
  })
  async getCustomerPortal(
    @CurrentUser() user: JwtPayload,
    @Query('returnUrl') returnUrl?: string,
  ): Promise<PortalResponseDto> {
    return this.billingService.createPortalSession(user, returnUrl);
  }

  /**
   * Cancela la suscripción del usuario autenticado y restaura el plan a STARTER.
   */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Cancelar suscripción y volver al plan Starter original',
    description:
      'Cancela la suscripción activa del usuario y degrada su nivel de cuenta a STARTER.',
  })
  @ApiOkResponse({
    description: 'Suscripción cancelada exitosamente',
  })
  async cancelSubscription(@CurrentUser() user: JwtPayload) {
    return this.billingService.cancelSubscription(user.sub);
  }

  /**
   * Activa el plan PRO directamente (Modo desarrollo / Pruebas).
   */
  @Post('simulate-upgrade')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Activar plan PRO directamente (Modo desarrollo / Pruebas)',
    description:
      'Simula el webhook de activación de Stripe y promueve la cuenta a PRO.',
  })
  @ApiOkResponse({
    description: 'Plan cambiado a PRO exitosamente',
  })
  async simulateUpgrade(@CurrentUser() user: JwtPayload) {
    return this.billingService.upgradeToProSimulated(user.sub);
  }

  /**
   * Confirma el pago de una sesión interactiva en Stripe Checkout Sandbox (Suscripción o Pedido Físico).
   */
  @Post('checkout/sandbox/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Confirmar pago en UI de Stripe Checkout Sandbox',
    description:
      'Procesa la confirmación de tarjeta desde la UI interactiva de Stripe Checkout Sandbox para suscripción PRO o pedidos físicos NFC.',
  })
  @ApiOkResponse({
    description: 'Pago confirmado y estado actualizado',
  })
  async completeSandboxCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteSandboxCheckoutDto,
  ) {
    return this.billingService.completeSandboxCheckout(user, dto);
  }

  /**
   * Procesa la orden de insumos físicos (placas QR, stickers NFC) sujeta a Feature Flag.
   */
  @Post('checkout/physical')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Iniciar compra de insumos físicos (Feature Flag: ENABLE_PHYSICAL_ORDERS)',
    description:
      'Registra un pedido de hardware (placas acrílicas/tarjetas NFC) y crea la sesión de pago en Stripe en un solo cobro.',
  })
  @ApiOkResponse({
    description: 'Sesión de pago generada exitosamente',
    type: CheckoutResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Módulo de pedidos físicos deshabilitado temporalmente',
  })
  @ApiNotFoundResponse({
    description: 'Uno o más linkId no existen o no pertenecen al usuario autenticado',
  })
  @ApiBadRequestResponse({
    description: 'Datos de la orden inválidos o tipo de insumo no soportado',
  })
  @ApiUnauthorizedResponse({
    description: 'Token JWT no proporcionado o inválido',
  })
  async createPhysicalOrderCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.billingService.createPhysicalOrderCheckout(user, dto);
  }

  /**
   * Emite una orden física directamente en estado 'paid' e 'in_production'.
   */
  @Post('orders/direct')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Emitir orden de insumos físicos directamente (Modo Directo / Pruebas)',
    description:
      'Registra y emite la orden física pasando directamente a cola de manufactura.',
  })
  @ApiOkResponse({
    description: 'Orden física emitida exitosamente',
  })
  async createDirectPhysicalOrder(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePhysicalOrderCheckoutDto,
  ) {
    return this.billingService.createDirectPhysicalOrder(user, dto);
  }

  /**
   * Consulta el historial de órdenes de insumos físicos del usuario autenticado.
   */
  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Listar órdenes de insumos físicos del usuario',
    description: 'Retorna todas las órdenes de placas y tarjetas NFC emitidas por el cliente.',
  })
  @ApiOkResponse({
    description: 'Lista de órdenes físicas',
  })
  async getOrders(@CurrentUser() user: JwtPayload) {
    return this.billingService.findOrdersByUserId(user.sub);
  }

  /**
   * Receptor público de eventos de Stripe Webhooks.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receptor de eventos Webhook de Stripe',
    description:
      'Endpoint público para sincronización asíncrona de eventos de Stripe con validación criptográfica de firma HMAC.',
  })
  @ApiOkResponse({
    description: 'Evento recibido y procesado',
    schema: {
      type: 'object',
      properties: {
        received: { type: 'boolean', example: true },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Firma HMAC de Stripe ausente o inválida',
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Cabecera stripe-signature requerida');
    }

    const rawBody =
      req.rawBody ??
      (Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === 'string'
              ? req.body
              : JSON.stringify(req.body || {}),
          ));

    return this.billingService.handleStripeWebhook(rawBody, signature);
  }
}
