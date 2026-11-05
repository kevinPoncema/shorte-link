import {
  BadRequestException,
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
import { Subscription } from '../models/subscription.entity';
import { PhysicalOrderService } from './physical-order.service';
import { StripeService } from './stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';

export interface BillingRuntimeConfig {
  physicalOrdersEnabled: boolean;
  proPriceIdConfigured: boolean;
  stripeMockMode: boolean;
  hardwarePrices: Record<string, number>;
}

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

  getBillingConfig(): BillingRuntimeConfig {
    return {
      physicalOrdersEnabled: this.isPhysicalOrdersEnabled(),
      proPriceIdConfigured: Boolean(this.resolveDefaultProPriceId()),
      stripeMockMode: this.isStripePlaceholderKey(),
      hardwarePrices: this.getBaseHardwarePrices(),
    };
  }

  setPhysicalOrdersEnabled(enabled: boolean): { physicalOrdersEnabled: boolean } {
    return this.physicalOrderService.setPhysicalOrdersEnabled(enabled);
  }

  isPhysicalOrdersEnabled(): boolean {
    return this.physicalOrderService.isPhysicalOrdersEnabled();
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    const normalizedUserId = userId.trim();
    return this.subscriptionRepository.findByUserId(normalizedUserId);
  }

  async createSubscriptionCheckout(
    user: JwtPayload,
    dto: CreateSubscriptionCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    const priceId = this.resolvePriceId(dto.priceId);

    try {
      const checkoutUrl = await this.executeStripeSubscriptionCheckout(
        user,
        priceId,
        dto,
      );
      return { checkoutUrl };
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }

      if (this.shouldFallbackToSimulatedStripe(err)) {
        return this.handleSandboxSubscriptionFallback(user, priceId, dto, err);
      }

      this.logger.error(
        `Error al crear sesión de suscripción en Stripe: ${err.message}`,
      );
      throw new BadRequestException(
        `No se pudo iniciar la sesión en Stripe: ${err.message}`,
      );
    }
  }

  async createPortalSession(
    user: JwtPayload,
    returnUrl?: string,
  ): Promise<PortalResponseDto> {
    const { customerId, effectiveReturnUrl } =
      await this.resolveCustomerBillingPortalTarget(user.sub, returnUrl);

    if (customerId.startsWith('cus_sim_')) {
      return { url: this.buildSandboxPortalUrl(effectiveReturnUrl) };
    }

    return this.executeStripePortalSession(customerId, effectiveReturnUrl);
  }

  async cancelSubscription(userId: string): Promise<{
    success: boolean;
    message: string;
    plan: string;
    accessToken?: string;
  }> {
    const subscription = await this.findByUserId(userId);
    if (subscription) {
      await this.cancelStripeSubscriptionIfActive(
        subscription.providerSubscriptionId,
      );
      await this.persistSubscriptionCancellation(subscription);
    }

    await this.usersService.updatePlanTier(userId, 'STARTER');
    const accessToken = await this.issueRefreshedTokenIfPossible(
      userId,
      'STARTER',
    );
    this.logger.log(`Usuario ${userId} canceló suscripción y volvió a STARTER.`);

    return {
      success: true,
      message:
        'Suscripción cancelada exitosamente. Tu cuenta ha vuelto al plan STARTER.',
      plan: 'STARTER',
      ...(accessToken ? { accessToken } : {}),
    };
  }

  async upgradeToProSimulated(userId: string): Promise<{
    success: boolean;
    message: string;
    plan: string;
    accessToken?: string;
  }> {
    await this.persistSimulatedProSubscription(userId);
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

  async createPhysicalOrderCheckout(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.physicalOrderService.createPhysicalOrderCheckout(
      user,
      dto,
      this.buildSandboxPhysicalOrderUrl.bind(this),
      this.shouldFallbackToSimulatedStripe.bind(this),
    );
  }

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

    const order = await this.findAndValidateSandboxOrder(user.sub, dto.orderId);
    await this.markSandboxOrderPaidAndInProduction(order.id, dto.sessionId);

    this.logger.log(
      `Pago confirmado en Stripe Checkout Sandbox para orden física ${order.id}. Estado: paid / in_production.`,
    );

    return {
      success: true,
      message: 'Pago confirmado exitosamente. Tu pedido ha pasado a producción.',
      orderId: order.id,
    };
  }

  async handleStripeWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true }> {
    return this.stripeWebhookService.handleWebhook(rawBody, signature);
  }

  assertPhysicalOrdersEnabled(): void {
    return this.physicalOrderService.assertPhysicalOrdersEnabled();
  }

  async validateLinkOwnershipForItems(
    userId: string,
    items: Array<{ linkId?: string }>,
  ): Promise<void> {
    return this.physicalOrderService.validateLinkOwnershipForItems(userId, items);
  }

  async findOrdersByUserId(userId: string): Promise<Order[]> {
    return this.physicalOrderService.findOrdersByUserId(userId);
  }

  async createDirectPhysicalOrder(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<Order> {
    return this.physicalOrderService.createDirectPhysicalOrder(user, dto);
  }

  getBaseHardwarePrices(): Record<string, number> {
    return this.physicalOrderService.getBaseHardwarePrices();
  }

  private resolvePriceId(requestedPriceId?: string): string {
    const priceId = requestedPriceId?.trim() || this.resolveDefaultProPriceId();
    if (!priceId) {
      throw new BadRequestException(
        'El ID del precio de Stripe (priceId) no fue proporcionado ni configurado en el entorno.',
      );
    }
    return priceId;
  }

  private async executeStripeSubscriptionCheckout(
    user: JwtPayload,
    priceId: string,
    dto: CreateSubscriptionCheckoutDto,
  ): Promise<string> {
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

    return session.url;
  }

  private async handleSandboxSubscriptionFallback(
    user: JwtPayload,
    priceId: string,
    dto: CreateSubscriptionCheckoutDto,
    err: any,
  ): Promise<CheckoutResponseDto> {
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

  private async resolveCustomerBillingPortalTarget(
    userId: string,
    returnUrl?: string,
  ): Promise<{ customerId: string; effectiveReturnUrl: string }> {
    const subscription = await this.findByUserId(userId);

    if (!subscription || !subscription.providerCustomerId) {
      throw new BadRequestException(
        'El usuario no posee una cuenta de facturación registrada en Stripe.',
      );
    }

    const defaultReturnUrl =
      this.configService.get<string>('APP_BASE_URL') || 'http://localhost:3000';
    const effectiveReturnUrl = returnUrl || defaultReturnUrl;

    return {
      customerId: subscription.providerCustomerId,
      effectiveReturnUrl,
    };
  }

  private async executeStripePortalSession(
    customerId: string,
    effectiveReturnUrl: string,
  ): Promise<PortalResponseDto> {
    try {
      const portalSession = await this.stripeService.createPortalSession(
        customerId,
        effectiveReturnUrl,
      );
      return { url: portalSession.url };
    } catch (err: any) {
      if (this.shouldFallbackToSimulatedStripe(err)) {
        this.logger.warn(
          'Credenciales Stripe de desarrollo detectadas en Customer Portal. Redirigiendo a UI de Stripe Billing Portal Sandbox.',
        );
        return { url: this.buildSandboxPortalUrl(effectiveReturnUrl) };
      }

      this.logger.error(
        `Error al crear sesión en Stripe Customer Portal: ${err.message}`,
      );
      throw new BadRequestException(
        `No se pudo abrir Stripe Customer Portal: ${err.message}`,
      );
    }
  }

  private async cancelStripeSubscriptionIfActive(
    providerSubscriptionId?: string | null,
  ): Promise<void> {
    if (
      providerSubscriptionId &&
      !providerSubscriptionId.startsWith('sub_sim_')
    ) {
      try {
        await this.stripeService
          .getStripeInstance()
          .subscriptions.cancel(providerSubscriptionId);
      } catch (e: any) {
        this.logger.warn(
          `No se pudo cancelar en Stripe (${providerSubscriptionId}): ${e.message}`,
        );
      }
    }
  }

  private async persistSubscriptionCancellation(
    subscription: Subscription,
  ): Promise<void> {
    subscription.status = 'canceled';
    await this.subscriptionRepository.save(subscription);
  }

  private async persistSimulatedProSubscription(userId: string): Promise<void> {
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
  }

  private async findAndValidateSandboxOrder(
    userId: string,
    orderId?: string,
  ): Promise<Order> {
    if (!orderId) {
      throw new BadRequestException(
        'El parámetro orderId es obligatorio para confirmar un pago físico.',
      );
    }

    const order = await this.orderRepository.findById(orderId.trim());
    if (!order || order.userId !== userId) {
      throw new NotFoundException(
        'La orden física especificada no existe o no pertenece a tu cuenta.',
      );
    }

    return order;
  }

  private async markSandboxOrderPaidAndInProduction(
    orderId: string,
    sessionId?: string,
  ): Promise<void> {
    await this.orderRepository.update(orderId, {
      paymentStatus: 'paid',
      fulfillmentStatus: 'in_production',
      providerPaymentIntentId:
        sessionId?.trim() || `pi_sandbox_${orderId.slice(0, 8)}`,
    });
  }

  private buildSandboxPhysicalOrderUrl(
    savedOrder: Order,
    orderDto: CreatePhysicalOrderCheckoutDto,
  ): string {
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
  }

  private resolveDefaultProPriceId(): string | undefined {
    const raw = this.configService.get<string>('STRIPE_PRO_PRICE_ID');
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  private isStripePlaceholderKey(): boolean {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    const trimmed = key.trim();
    return (
      !trimmed ||
      trimmed === 'sk_test_placeholder' ||
      trimmed.includes('MockStripeSecretKey')
    );
  }

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

  private buildSandboxPortalUrl(returnUrl: string): string {
    const origin = this.extractFrontendOrigin(returnUrl);
    const search = new URLSearchParams({
      stripe_sandbox: 'portal',
      returnUrl,
    });
    return `${origin}/?${search.toString()}`;
  }

  private extractFrontendOrigin(urlCandidate: string): string {
    try {
      return new URL(urlCandidate).origin;
    } catch {
      return 'http://localhost:5173';
    }
  }
}
