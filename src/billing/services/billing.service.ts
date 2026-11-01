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
import { StripeService } from './stripe.service';

export interface BillingRuntimeConfig {
  physicalOrdersEnabled: boolean;
  proPriceIdConfigured: boolean;
  stripeMockMode: boolean;
  hardwarePrices: Record<string, number>;
}

/**
 * Servicio de dominio del módulo de facturación (`BillingService`).
 * Coordina suscripciones recurrentes SaaS, pedidos de insumos físicos (bajo Feature Flag booleano),
 * sesiones del Customer Portal y sincronización idempotente de Webhooks de Stripe.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private physicalOrdersFlagOverride: boolean | null = null;

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
  ) {}

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
    this.physicalOrdersFlagOverride = Boolean(enabled);
    this.logger.log(
      `Feature Flag de pedidos físicos actualizado dinámicamente a: ${this.physicalOrdersFlagOverride}`,
    );
    return { physicalOrdersEnabled: this.isPhysicalOrdersEnabled() };
  }

  /**
   * Determina si el módulo de pedidos físicos está activo evaluando el override booleano
   * en memoria o la variable de entorno `ENABLE_PHYSICAL_ORDERS` (activa por defecto `true`).
   */
  isPhysicalOrdersEnabled(): boolean {
    if (this.physicalOrdersFlagOverride !== null) {
      return this.physicalOrdersFlagOverride;
    }

    const rawFlag = this.configService.get<string | boolean>(
      'ENABLE_PHYSICAL_ORDERS',
    );
    return this.parseBooleanFlag(rawFlag, true);
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
        this.logger.warn(
          `Credenciales Stripe de desarrollo detectadas (${err.message}). Ejecutando simulación local de Checkout PRO para usuario ${user.sub}.`,
        );
        await this.upgradeToProSimulated(user.sub);
        return { checkoutUrl: dto.successUrl };
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
      return { url: effectiveReturnUrl };
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
          `Credenciales Stripe de desarrollo detectadas en Customer Portal. Redirigiendo a ${effectiveReturnUrl}.`,
        );
        return { url: effectiveReturnUrl };
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
  async createPhysicalOrderCheckout(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    this.assertPhysicalOrdersEnabled();

    if (!dto.successUrl || !dto.cancelUrl) {
      throw new BadRequestException(
        'successUrl y cancelUrl son obligatorios para generar una sesión de Stripe Checkout.',
      );
    }

    await this.validateLinkOwnershipForItems(user.sub, dto.items);

    const priceMap = this.getBaseHardwarePrices();
    let totalAmount = 0;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    const orderItems = dto.items.map((item) => {
      const unitPrice = priceMap[item.itemType];
      if (unitPrice === undefined) {
        throw new BadRequestException(
          `Tipo de insumo no soportado: '${item.itemType}'. Tipos permitidos: ${Object.keys(priceMap).join(', ')}`,
        );
      }

      totalAmount += unitPrice * item.quantity;

      const itemName =
        item.itemType === 'acrylic_stand'
          ? 'Placa Acrílica con Código QR y chip NFC'
          : item.itemType === 'plastic_card' || item.itemType === 'nfc_card'
            ? 'Tarjeta Plástica PVC con Código QR y chip NFC'
            : item.itemType === 'nfc_sticker'
              ? 'Sticker Adhesivo con Código QR y chip NFC'
              : `Hardware QR: ${item.itemType}`;

      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(unitPrice * 100),
          product_data: {
            name: itemName,
            metadata: {
              itemType: item.itemType,
              linkId: item.linkId || '',
            },
          },
        },
        quantity: item.quantity,
      });

      return {
        linkId: item.linkId ?? null,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice,
        specifications: item.specifications ?? null,
      };
    });

    const newOrder: Partial<Order> = {
      userId: user.sub,
      totalAmount,
      currency: 'USD',
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      shippingAddress: dto.shippingAddress,
      items: orderItems as any,
    };

    const savedOrder = await this.orderRepository.createAndSave(newOrder);

    const subscription = await this.findByUserId(user.sub);
    const customerId =
      subscription?.providerCustomerId &&
      !subscription.providerCustomerId.startsWith('cus_sim_')
        ? subscription.providerCustomerId
        : undefined;

    try {
      const session = await this.stripeService.createPaymentCheckoutSession({
        customerId,
        customerEmail: customerId ? undefined : user.email,
        orderId: savedOrder.id,
        userId: user.sub,
        lineItems,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
      });

      await this.orderRepository.update(savedOrder.id, {
        providerPaymentIntentId: session.id,
      });

      if (!session.url) {
        throw new BadRequestException(
          'Stripe no devolvió una URL válida para la sesión de pago físico.',
        );
      }

      return { checkoutUrl: session.url };
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }

      if (this.shouldFallbackToSimulatedStripe(err)) {
        const simId = `cs_sim_order_${savedOrder.id}`;
        await this.orderRepository.update(savedOrder.id, {
          paymentStatus: 'paid',
          fulfillmentStatus: 'in_production',
          providerPaymentIntentId: simId,
        });
        this.logger.warn(
          `Credenciales Stripe de desarrollo detectadas. Orden física ${savedOrder.id} marcada como 'paid' e 'in_production'.`,
        );
        return { checkoutUrl: dto.successUrl };
      }

      this.logger.error(`Error al crear sesión de pago físico en Stripe: ${err.message}`);
      throw new BadRequestException(
        `No se pudo iniciar la sesión de pago en Stripe: ${err.message}`,
      );
    }
  }

  /**
   * **Receptor y despachador de eventos de Stripe Webhooks (`POST /billing/webhook`):**
   * Valida la firma HMAC, enruta los eventos obligatorios y garantiza idempotencia.
   */
  async handleStripeWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true }> {
    let event: Stripe.Event;

    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err: any) {
      this.logger.error(`Firma de Webhook de Stripe inválida: ${err.message}`);
      throw new BadRequestException(
        `Firma de Webhook inválida: ${err.message}`,
      );
    }

    this.logger.log(`Procesando Stripe Webhook Event: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionCreatedOrUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;

      default:
        this.logger.debug(`Evento de Stripe no manejado: ${event.type}`);
        break;
    }

    return { received: true };
  }

  // ===========================================================================
  // Métodos Auxiliares de Webhooks & Negocio
  // ===========================================================================

  /**
   * Valida el Feature Flag booleano `ENABLE_PHYSICAL_ORDERS` (o su override en ejecución).
   */
  private assertPhysicalOrdersEnabled(): void {
    if (!this.isPhysicalOrdersEnabled()) {
      throw new ForbiddenException(
        'Módulo de pedidos físicos deshabilitado temporalmente',
      );
    }
  }

  /**
   * Valida que todos los `linkId` enviados en la orden pertenezcan al usuario en sesión.
   */
  private async validateLinkOwnershipForItems(
    userId: string,
    items: Array<{ linkId?: string }>,
  ): Promise<void> {
    for (const item of items) {
      if (item.linkId) {
        try {
          await this.linksService.findOneByUser(userId, item.linkId);
        } catch (error) {
          throw new NotFoundException(
            `El enlace con ID '${item.linkId}' no existe o no pertenece a tu cuenta.`,
          );
        }
      }
    }
  }

  /**
   * Consulta el historial de pedidos de insumos físicos para un usuario.
   */
  async findOrdersByUserId(userId: string): Promise<Order[]> {
    return this.orderRepository.findByUserId(userId.trim());
  }

  /**
   * Emite una orden física directamente (Modo directo / Pruebas / Liquidación inmediata),
   * registrándola con estado 'paid' y 'in_production'.
   */
  async createDirectPhysicalOrder(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
  ): Promise<Order> {
    this.assertPhysicalOrdersEnabled();
    await this.validateLinkOwnershipForItems(user.sub, dto.items);

    const priceMap = this.getBaseHardwarePrices();
    let totalAmount = 0;

    const orderItems = dto.items.map((item) => {
      const unitPrice = priceMap[item.itemType];
      if (unitPrice === undefined) {
        throw new BadRequestException(
          `Tipo de insumo no soportado: '${item.itemType}'. Tipos permitidos: ${Object.keys(priceMap).join(', ')}`,
        );
      }

      totalAmount += unitPrice * item.quantity;

      return {
        linkId: item.linkId ?? null,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice,
        specifications: item.specifications ?? null,
      };
    });

    const newOrder: Partial<Order> = {
      userId: user.sub,
      totalAmount,
      currency: 'USD',
      paymentStatus: 'paid',
      fulfillmentStatus: 'in_production',
      shippingAddress: dto.shippingAddress,
      providerPaymentIntentId: `direct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      items: orderItems as any,
    };

    const saved = await this.orderRepository.createAndSave(newOrder);
    this.logger.log(
      `Orden física ${saved.id} emitida directamente y pasada a manufactura. Total: $${totalAmount}`,
    );
    return saved;
  }

  /**
   * Retorna los precios oficiales del backend para hardware físico.
   */
  private getBaseHardwarePrices(): Record<string, number> {
    const acrylic = Number(
      this.configService.get<string>('PRICE_ACRYLIC_STAND', '15.00'),
    );
    const plasticCard = Number(
      this.configService.get<string>('PRICE_PLASTIC_CARD') ||
      this.configService.get<string>('PRICE_NFC_CARD', '10.00'),
    );
    const nfcSticker = Number(
      this.configService.get<string>('PRICE_NFC_STICKER', '5.00'),
    );

    return {
      acrylic_stand: Number.isNaN(acrylic) ? 15.0 : acrylic,
      plastic_card: Number.isNaN(plasticCard) ? 10.0 : plasticCard,
      nfc_card: Number.isNaN(plasticCard) ? 10.0 : plasticCard,
      nfc_sticker: Number.isNaN(nfcSticker) ? 5.0 : nfcSticker,
    };
  }

  /**
   * Manejador de `customer.subscription.created` y `customer.subscription.updated`.
   */
  private async handleSubscriptionCreatedOrUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const subscriptionId = stripeSub.id;
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;
    const priceId = stripeSub.items?.data?.[0]?.price?.id ?? null;
    const status = stripeSub.status as SubscriptionStatus;
    const item = stripeSub.items?.data?.[0];
    const rawPeriodStart =
      (stripeSub as any).current_period_start ?? item?.current_period_start;
    const rawPeriodEnd =
      (stripeSub as any).current_period_end ?? item?.current_period_end;
    const currentPeriodStart = rawPeriodStart
      ? new Date(rawPeriodStart * 1000)
      : null;
    const currentPeriodEnd = rawPeriodEnd
      ? new Date(rawPeriodEnd * 1000)
      : null;
    const cancelAtPeriodEnd = stripeSub.cancel_at_period_end ?? false;

    const userId = await this.resolveUserIdFromStripe(
      stripeSub.metadata?.userId,
      customerId,
      subscriptionId,
    );

    if (userId) {
      await this.subscriptionRepository.upsert({
        userId,
        providerName: 'STRIPE',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        providerPriceId: priceId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      });

      if (status === 'active' || status === 'trialing') {
        await this.usersService.updatePlanTier(userId, 'PRO');
        this.logger.log(`Usuario ${userId} promovido a plan 'PRO' exitosamente.`);
      } else if (status === 'canceled') {
        await this.usersService.updatePlanTier(userId, 'STARTER');
        this.logger.log(`Usuario ${userId} degradado a plan 'STARTER'.`);
      } else if (status === 'past_due') {
        this.logger.warn(
          `Suscripción de usuario ${userId} en estado 'past_due'. Evaluando estado de facturación.`,
        );
      }
    } else {
      this.logger.warn(
        `No se pudo vincular la suscripción ${subscriptionId} con un userId interno.`,
      );
    }
  }

  /**
   * Manejador de `customer.subscription.deleted`.
   * Cancela la suscripción y degrada automáticamente al usuario al plan 'STARTER'.
   */
  private async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const subscriptionId = stripeSub.id;
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;

    const existing =
      (await this.subscriptionRepository.findBySubscriptionId(subscriptionId)) ??
      (await this.subscriptionRepository.findByCustomerId(customerId));

    const userId =
      existing?.userId ??
      (await this.resolveUserIdFromStripe(
        stripeSub.metadata?.userId,
        customerId,
        subscriptionId,
      ));

    if (existing) {
      existing.status = 'canceled';
      await this.subscriptionRepository.save(existing);
    } else if (userId) {
      await this.subscriptionRepository.upsert({
        userId,
        providerName: 'STRIPE',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        status: 'canceled',
      });
    }

    if (userId) {
      await this.usersService.updatePlanTier(userId, 'STARTER');
      this.logger.log(
        `Suscripción cancelada. Usuario ${userId} degradado a plan 'STARTER'.`,
      );
    }
  }

  /**
   * Manejador de `checkout.session.completed`.
   * Procesa pagos únicos de pedidos físicos o inicialización de suscripciones.
   */
  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.mode === 'payment') {
      const orderId = session.metadata?.orderId;
      if (orderId) {
        const order = await this.orderRepository.findById(orderId);
        if (order) {
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? session.id);

          await this.orderRepository.update(order.id, {
            paymentStatus: 'paid',
            fulfillmentStatus: 'in_production',
            providerPaymentIntentId: paymentIntentId,
          });

          this.logger.log(
            `Orden física ${orderId} marcada como 'paid' e 'in_production'. Pasa a cola de manufactura.`,
          );
        }
      }
    } else if (session.mode === 'subscription') {
      const userId = session.metadata?.userId;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

      if (userId && subscriptionId && customerId) {
        const isPaid = session.payment_status === 'paid';
        await this.subscriptionRepository.upsert({
          userId,
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          providerName: 'STRIPE',
          ...(isPaid ? { status: 'active' } : {}),
        });
        if (isPaid) {
          await this.usersService.updatePlanTier(userId, 'PRO');
        }
      }
    }
  }

  /**
   * Manejador de `invoice.payment_failed`.
   */
  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const rawSub =
      (invoice as any).subscription ??
      (invoice as any).subscription_details?.subscription;
    const subscriptionId =
      typeof rawSub === 'string' ? rawSub : rawSub?.id;

    if (subscriptionId) {
      const sub =
        await this.subscriptionRepository.findBySubscriptionId(subscriptionId);
      if (sub) {
        sub.status = 'past_due';
        await this.subscriptionRepository.save(sub);
        this.logger.warn(
          `Cobro fallido en factura ${invoice.id}. Suscripción ${subscriptionId} marcada como 'past_due'.`,
        );
      }
    }
  }

  /**
   * Resuelve el `userId` interno desde los metadatos de Stripe o los repositorios existentes.
   */
  private async resolveUserIdFromStripe(
    metadataUserId?: string,
    customerId?: string,
    subscriptionId?: string,
  ): Promise<string | null> {
    if (metadataUserId) {
      return metadataUserId;
    }

    if (subscriptionId) {
      const sub =
        await this.subscriptionRepository.findBySubscriptionId(subscriptionId);
      if (sub) return sub.userId;
    }

    if (customerId) {
      const sub =
        await this.subscriptionRepository.findByCustomerId(customerId);
      if (sub) return sub.userId;

      try {
        const stripeCustomer =
          await this.stripeService.getStripeInstance().customers.retrieve(customerId);
        if (
          !stripeCustomer.deleted &&
          (stripeCustomer as Stripe.Customer).metadata?.userId
        ) {
          return (stripeCustomer as Stripe.Customer).metadata.userId;
        }
      } catch (e) {
        // Fallback silencioso si no se puede recuperar el cliente
      }
    }

    return null;
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
}
