import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
import { AuthService } from '../../core/auth/services/auth.service';
import { UsersService } from '../../core/auth/services/users.service';
import { LinksService } from '../../core/links/services/links.service';
import { CheckoutResponseDto } from '../dto/checkout-response.dto';
import { CompleteSandboxCheckoutDto } from '../dto/complete-sandbox-checkout.dto';
import { CreatePhysicalOrderCheckoutDto } from '../dto/create-physical-order-checkout.dto';
import { CreateSubscriptionCheckoutDto } from '../dto/create-subscription-checkout.dto';
import { PortalResponseDto } from '../dto/portal-response.dto';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../interfaces/order-repository.interface';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../interfaces/subscription-repository.interface';
import { Order } from '../models/order.entity';
import { Subscription, SubscriptionStatus } from '../models/subscription.entity';
import { PhysicalOrderService } from './physical-order.service';
import { StripeService } from './stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';

export interface BillingRuntimeConfig {
  physicalOrdersEnabled: boolean;
  proPriceIdConfigured: boolean;
  stripeMockMode: boolean;
  hardwarePrices: Record<string, number>;
}

/**
 * Servicio de dominio del módulo de facturación (`BillingService`).
 * Actúa como orquestador y fachada de alto nivel, coordinando suscripciones recurrentes SaaS,
 * pedidos de insumos físicos (delegados en `PhysicalOrderService`) y webhooks (delegados en `StripeWebhookService`).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly physicalOrderService: PhysicalOrderService;
  private readonly stripeWebhookService: StripeWebhookService;

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepository: ISubscriptionRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly linksService: LinksService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly authService?: AuthService,
    @Optional()
    physicalOrderService?: PhysicalOrderService,
    @Optional()
    stripeWebhookService?: StripeWebhookService,
  ) {
    this.physicalOrderService =
      physicalOrderService ??
      new PhysicalOrderService(
        this.orderRepository,
        this.subscriptionRepository,
        this.stripeService,
        this.linksService,
        this.configService,
      );
    this.stripeWebhookService =
      stripeWebhookService ??
      new StripeWebhookService(
        this.subscriptionRepository,
        this.orderRepository,
        this.stripeService,
        this.usersService,
      );
  }

  /**
   * Retorna el estado actual de los Feature Flags y precios configurados en el módulo de facturación.
   */
  getBillingConfig(): BillingRuntimeConfig {
    return {
      physicalOrdersEnabled: this.isPhysicalOrdersEnabled(),
      proPriceIdConfigured: Boolean(this.resolveDefaultProPriceId()),
      stripeMockMode: this.isStripePlaceholderKey(),
      hardwarePrices: this.getBaseHardwarePrices(),
    };
  }

  /**
   * Activa o desactiva en tiempo de ejecución el módulo de pedidos físicos mediante un flag booleano.
   */
  setPhysicalOrdersEnabled(enabled: boolean): { physicalOrdersEnabled: boolean } {
    return this.physicalOrderService.setPhysicalOrdersEnabled(enabled);
  }

  /**
   * Determina si el módulo de pedidos físicos está activo.
   */
  isPhysicalOrdersEnabled(): boolean {
    return this.physicalOrderService.isPhysicalOrdersEnabled();
  }

  /**
   * Consulta el registro de suscripción vinculado al usuario autenticado.
   */
  async findByUserId(userId: string): Promise<Subscription | null> {
    const normalizedUserId = userId.trim();
    return this.subscriptionRepository.findByUserId(normalizedUserId);
  }

  /**
   * **Inicia la suscripción recurrente SaaS (`POST /billing/checkout/subscription`):**
   * 1. Resuelve o valida el identificador de precio (`priceId`).
   * 2. Obtiene o crea el cliente en Stripe asociando `userId`.
   * 3. Crea la sesión de Stripe Checkout en modo `subscription`.
   * 4. Registra/actualiza la suscripción en base de datos en estado `'incomplete'`.
   * 5. Retorna `{ checkoutUrl: session.url }`.
   */
  async createSubscriptionCheckout(
    user: JwtPayload,
    dto: CreateSubscriptionCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    const priceId = dto.priceId?.trim() || this.resolveDefaultProPriceId();

    if (!priceId) {
      throw new BadRequestException(
        'El ID del precio de Stripe (priceId) no fue proporcionado ni configurado en el entorno.',
      );
    }

    try {
      const customer = await this.stripeService.findOrCreateCustomer(
        user.email,
        user.sub,
      );

      const session =
        await this.stripeService.createSubscriptionCheckoutSession({
          customerId: customer.id,
          priceId,
          successUrl: dto.successUrl,
          cancelUrl: dto.cancelUrl,
          userId: user.sub,
        });

      await this.subscriptionRepository.upsert({
        userId: user.sub,
        providerName: 'STRIPE',
        providerCustomerId: customer.id,
        providerPriceId: priceId,
        status: 'incomplete',
      });

      if (!session.url) {
        throw new BadRequestException(
          'Stripe no devolvió una URL válida para la sesión de Checkout.',
        );
      }

      return { checkoutUrl: session.url };
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }

      if (this.shouldFallbackToSimulatedStripe(err)) {
        const sandboxSessionId = `cs_sandbox_sub_${Date.now()}`;
        await this.subscriptionRepository.upsert({
          userId: user.sub,
          providerName: 'STRIPE',
          providerCustomerId: `cus_sim_${user.sub.slice(0, 8)}`,
          providerPriceId: priceId,
          status: 'incomplete',
        });
        this.logger.warn(
          `Credenciales Stripe de desarrollo detectadas (${err.message}). Redirigiendo a UI interactiva de Stripe Checkout Sandbox (${sandboxSessionId}) para usuario ${user.sub}.`,
        );
        return {
          checkoutUrl: this.buildSandboxCheckoutUrl(dto.successUrl, {
            mode: 'subscription',
            sessionId: sandboxSessionId,
            amount: '19.00',
            title: 'Plan PRO — Suscripción Mensual',
            subtitle:
              'Hasta 50 enlaces dinámicos activos, colores QR de marca y analíticas de 365 días',
            successUrl: dto.successUrl,
            cancelUrl: dto.cancelUrl,
          }),
        };
      }

      this.logger.error(`Error al crear sesión de suscripción en Stripe: ${err.message}`);
      throw new BadRequestException(
        `No se pudo iniciar la sesión en Stripe: ${err.message}`,
      );
    }
  }

  /**
   * **Genera una sesión del Stripe Customer Portal (`GET /billing/portal`):**
   * 1. Recupera el `providerCustomerId` del usuario autenticado.
   * 2. Genera una sesión de portal con `stripe.billingPortal.sessions.create`.
   * 3. Retorna `{ url: portalSession.url }`.
   */
  async createPortalSession(
    user: JwtPayload,
    returnUrl?: string,
  ): Promise<PortalResponseDto> {
    const subscription = await this.findByUserId(user.sub);

    if (!subscription || !subscription.providerCustomerId) {
      throw new BadRequestException(
        'El usuario no posee una cuenta de facturación registrada en Stripe.',
      );
    }

    const defaultReturnUrl =
      this.configService.get<string>('APP_BASE_URL') ||
      'http://localhost:3000';
    const effectiveReturnUrl = returnUrl || defaultReturnUrl;

    if (subscription.providerCustomerId.startsWith('cus_sim_')) {
      return { url: this.buildSandboxPortalUrl(effectiveReturnUrl) };
    }

    try {
      const portalSession = await this.stripeService.createPortalSession(
        subscription.providerCustomerId,
        effectiveReturnUrl,
      );

      return { url: portalSession.url };
    } catch (err: any) {
      if (this.shouldFallbackToSimulatedStripe(err)) {
        this.logger.warn(
          `Credenciales Stripe de desarrollo detectadas en Customer Portal. Redirigiendo a UI de Stripe Billing Portal Sandbox.`,
        );
        return { url: this.buildSandboxPortalUrl(effectiveReturnUrl) };
      }

      this.logger.error(`Error al crear sesión en Stripe Customer Portal: ${err.message}`);
      throw new BadRequestException(
        `No se pudo abrir Stripe Customer Portal: ${err.message}`,
      );
    }
  }

  /**
   * Cancela la suscripción del usuario, actualiza el registro a `'canceled'`
   * y degrada la cuenta automáticamente al plan original `'STARTER'`.
   */
  async cancelSubscription(userId: string): Promise<{
    success: boolean;
    message: string;
    plan: string;
    accessToken?: string;
  }> {
    const sub = await this.findByUserId(userId);
    if (sub) {
      if (
        sub.providerSubscriptionId &&
        !sub.providerSubscriptionId.startsWith('sub_sim_')
      ) {
        try {
          await this.stripeService
            .getStripeInstance()
            .subscriptions.cancel(sub.providerSubscriptionId);
        } catch (e: any) {
          this.logger.warn(
            `No se pudo cancelar en Stripe (${sub.providerSubscriptionId}): ${e.message}`,
          );
        }
      }
      sub.status = 'canceled';
      await this.subscriptionRepository.save(sub);
    }

    await this.usersService.updatePlanTier(userId, 'STARTER');
    const accessToken = await this.issueRefreshedTokenIfPossible(userId, 'STARTER');
    this.logger.log(`Usuario ${userId} canceló suscripción y volvió a STARTER.`);

    return {
      success: true,
      message:
        'Suscripción cancelada exitosamente. Tu cuenta ha vuelto al plan STARTER.',
      plan: 'STARTER',
      ...(accessToken ? { accessToken } : {}),
    };
  }

  /**
   * Activa el plan PRO directamente (útil para pruebas o modo offline sin Stripe CLI).
   */
  async upgradeToProSimulated(userId: string): Promise<{
    success: boolean;
    message: string;
    plan: string;
    accessToken?: string;
  }> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.subscriptionRepository.upsert({
      userId,
      providerName: 'STRIPE',
      providerCustomerId: `cus_sim_${userId.slice(0, 8)}`,
      providerSubscriptionId: `sub_sim_${userId.slice(0, 8)}`,
      providerPriceId: this.resolveDefaultProPriceId() || 'price_pro_simulated',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    await this.usersService.updatePlanTier(userId, 'PRO');
    const accessToken = await this.issueRefreshedTokenIfPossible(userId, 'PRO');
    this.logger.log(`Usuario ${userId} activó plan PRO en modo simulado.`);

    return {
      success: true,
      message: 'Plan cambiado exitosamente a PRO.',
      plan: 'PRO',
      ...(accessToken ? { accessToken } : {}),
    };
  }

  /**
   * **Procesa una orden de insumos físicos (`POST /billing/checkout/physical`):**
   * 1. Valida el Feature Flag `ENABLE_PHYSICAL_ORDERS`.
   * 2. Valida la pertenencia de los `linkId` proporcionados contra el usuario en sesión.
   * 3. Calcula el total sumando precios congelados en el backend.
   * 4. Inserta la orden en estado `'pending'` junto a los `order_items`.
   * 5. Crea una sesión de Stripe Checkout en modo `'payment'`.
   * 6. Actualiza la orden con el identificador de sesión.
   * 7. Retorna `{ checkoutUrl: session.url }`.
   */
  /**
   * **Inicia la compra de insumos físicos QR + NFC (`POST /billing/checkout/physical`):**
   * Delega la lógica de cálculo y persistencia a `PhysicalOrderService`.
   */
  async createPhysicalOrderCheckout(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.physicalOrderService.createPhysicalOrderCheckout(
      user,
      dto,
      (savedOrder, orderDto) => {
        const totalAmount = Number(savedOrder.totalAmount);
        const totalQty = orderDto.items.reduce((acc, it) => acc + it.quantity, 0);
        const firstType = orderDto.items[0]?.itemType || 'acrylic_stand';
        const primaryTitle =
          firstType === 'acrylic_stand'
            ? 'Placa Acrílica con QR + NFC'
            : firstType === 'plastic_card' || firstType === 'nfc_card'
              ? 'Tarjeta Plástica PVC con QR + NFC'
              : firstType === 'nfc_sticker'
                ? 'Sticker Resinado Anti-Metal NFC'
                : `Hardware QR + NFC (${firstType})`;

        this.logger.warn(
          `Credenciales Stripe de desarrollo detectadas. Redirigiendo orden física ${savedOrder.id} a UI interactiva de Stripe Checkout Sandbox.`,
        );

        return this.buildSandboxCheckoutUrl(orderDto.successUrl!, {
          mode: 'payment',
          orderId: savedOrder.id,
          sessionId:
            savedOrder.providerPaymentIntentId ||
            `cs_sandbox_order_${savedOrder.id}`,
          amount: totalAmount.toFixed(2),
          title: primaryTitle,
          subtitle: `${totalQty} unidad(es) • Entrega en ${orderDto.shippingAddress.city} (${orderDto.shippingAddress.fullName})`,
          qty: String(totalQty),
          successUrl: orderDto.successUrl!,
          cancelUrl: orderDto.cancelUrl!,
        });
      },
      (err) => this.shouldFallbackToSimulatedStripe(err),
    );
  }

  /**
   * **Confirma el pago desde la UI interactiva de Stripe Checkout Sandbox (`POST /billing/checkout/sandbox/complete`):**
   * - En modo `'subscription'`: activa la suscripción PRO y emite un JWT renovado.
   * - En modo `'payment'`: marca la orden física pendiente del usuario como `'paid'` e `'in_production'`.
   */
  async completeSandboxCheckout(
    user: JwtPayload,
    dto: CompleteSandboxCheckoutDto,
  ): Promise<{
    success: boolean;
    message: string;
    plan?: string;
    orderId?: string;
    accessToken?: string;
  }> {
    if (dto.mode === 'subscription') {
      return this.upgradeToProSimulated(user.sub);
    }

    if (!dto.orderId) {
      throw new BadRequestException(
        'El parámetro orderId es obligatorio para confirmar un pago físico.',
      );
    }

    const order = await this.orderRepository.findById(dto.orderId.trim());
    if (!order || order.userId !== user.sub) {
      throw new NotFoundException(
        'La orden física especificada no existe o no pertenece a tu cuenta.',
      );
    }

    await this.orderRepository.update(order.id, {
      paymentStatus: 'paid',
      fulfillmentStatus: 'in_production',
      providerPaymentIntentId:
        dto.sessionId?.trim() || `pi_sandbox_${order.id.slice(0, 8)}`,
    });

    this.logger.log(
      `Pago confirmado en Stripe Checkout Sandbox para orden física ${order.id}. Estado: paid / in_production.`,
    );

    return {
      success: true,
      message: 'Pago confirmado exitosamente. Tu pedido ha pasado a producción.',
      orderId: order.id,
    };
  }

  /**
   * **Receptor y despachador de eventos de Stripe Webhooks (`POST /billing/webhook`):**
   * Valida la firma HMAC, enruta los eventos obligatorios y garantiza idempotencia.
   */
  /**
   * **Receptor y despachador de eventos de Stripe Webhooks (`POST /billing/webhook`):**
   * Valida la firma HMAC, enruta los eventos obligatorios y garantiza idempotencia.
   * Delega el procesamiento especializado en `StripeWebhookService`.
   */
  async handleStripeWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true }> {
    return this.stripeWebhookService.handleWebhook(rawBody, signature);
  }

  // ===========================================================================
  // Métodos Auxiliares de Pedidos Físicos y Webhooks (Delegados)
  // ===========================================================================

  /**
   * Valida el Feature Flag booleano `ENABLE_PHYSICAL_ORDERS`.
   */
  assertPhysicalOrdersEnabled(): void {
    return this.physicalOrderService.assertPhysicalOrdersEnabled();
  }

  /**
   * Valida que todos los `linkId` enviados en la orden pertenezcan al usuario en sesión.
   */
  async validateLinkOwnershipForItems(
    userId: string,
    items: Array<{ linkId?: string }>,
  ): Promise<void> {
    return this.physicalOrderService.validateLinkOwnershipForItems(userId, items);
  }

  /**
   * Consulta el historial de pedidos de insumos físicos para un usuario.
   */
  async findOrdersByUserId(userId: string): Promise<Order[]> {
    return this.physicalOrderService.findOrdersByUserId(userId);
  }

  /**
   * Emite una orden física directamente (Modo directo / Pruebas / Liquidación inmediata),
   * registrándola con estado 'paid' y 'in_production'.
   */
  async createDirectPhysicalOrder(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<Order> {
    return this.physicalOrderService.createDirectPhysicalOrder(user, dto);
  }

  /**
   * Retorna los precios oficiales del backend para hardware físico.
   */
  getBaseHardwarePrices(): Record<string, number> {
    return this.physicalOrderService.getBaseHardwarePrices();
  }

  private async handleSubscriptionCreatedOrUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    return this.stripeWebhookService.handleSubscriptionCreatedOrUpdated(stripeSub);
  }

  private async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    return this.stripeWebhookService.handleSubscriptionDeleted(stripeSub);
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    return this.stripeWebhookService.handleCheckoutSessionCompleted(session);
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    return this.stripeWebhookService.handleInvoicePaymentFailed(invoice);
  }

  private async resolveUserIdFromStripe(
    metadataUserId?: string,
    customerId?: string,
    subscriptionId?: string,
  ): Promise<string | null> {
    return this.stripeWebhookService.resolveUserIdFromStripe(
      metadataUserId,
      customerId,
      subscriptionId,
    );
  }

  /**
   * Evalúa un valor booleano o cadena de configuración (`true`/`false`, `1`/`0`, `yes`/`no`).
   */
  private parseBooleanFlag(value: unknown, defaultValue = true): boolean {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === '') {
        return defaultValue;
      }
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return defaultValue;
  }

  /**
   * Obtiene el `STRIPE_PRO_PRICE_ID` configurado en el entorno recortando espacios.
   */
  private resolveDefaultProPriceId(): string | undefined {
    const raw = this.configService.get<string>('STRIPE_PRO_PRICE_ID');
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Indica si la llave secreta de Stripe corresponde a un placeholder de desarrollo local.
   */
  private isStripePlaceholderKey(): boolean {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    const trimmed = key.trim();
    return (
      !trimmed ||
      trimmed === 'sk_test_placeholder' ||
      trimmed.includes('MockStripeSecretKey')
    );
  }

  /**
   * Determina si un fallo de comunicación con Stripe debe degradarse limpiamente a simulación local
   * cuando se utilizan llaves placeholder de desarrollo.
   */
  private shouldFallbackToSimulatedStripe(err: any): boolean {
    if (!this.isStripePlaceholderKey()) {
      return false;
    }
    const msg = String(err?.message || '').toLowerCase();
    const type = String(err?.type || '');
    return (
      type === 'StripeAuthenticationError' ||
      msg.includes('invalid api key') ||
      msg.includes('expired api key')
    );
  }

  /**
   * Firma un nuevo token JWT con el plan actualizado cuando `AuthService` está disponible.
   */
  private async issueRefreshedTokenIfPossible(
    userId: string,
    planTier: string,
  ): Promise<string | undefined> {
    if (!this.authService) {
      return undefined;
    }
    const user = await this.usersService.findById(userId);
    if (!user) {
      return undefined;
    }
    return this.authService.issueTokenForUser({
      id: user.id,
      email: user.email,
      plan: planTier,
    });
  }

  /**
   * Construye la URL de la pasarela interactiva Stripe Checkout Sandbox alojada en el frontend.
   */
  private buildSandboxCheckoutUrl(
    targetReturnUrl: string,
    params: Record<string, string>,
  ): string {
    const origin = this.extractFrontendOrigin(targetReturnUrl);
    const search = new URLSearchParams({
      stripe_sandbox: 'checkout',
      ...params,
    });
    return `${origin}/?${search.toString()}`;
  }

  /**
   * Construye la URL del Stripe Customer Portal Sandbox alojado en el frontend.
   */
  private buildSandboxPortalUrl(returnUrl: string): string {
    const origin = this.extractFrontendOrigin(returnUrl);
    const search = new URLSearchParams({
      stripe_sandbox: 'portal',
      returnUrl,
    });
    return `${origin}/?${search.toString()}`;
  }

  /**
   * Extrae el origen (`protocol + host`) desde la URL de retorno del cliente.
   */
  private extractFrontendOrigin(urlCandidate: string): string {
    try {
      return new URL(urlCandidate).origin;
    } catch {
      return 'http://localhost:5173';
    }
  }
}
