import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
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

/**
 * Servicio de dominio del módulo de facturación (`BillingService`).
 * Coordina suscripciones recurrentes SaaS, pedidos de insumos físicos (bajo Feature Flag),
 * sesiones del Customer Portal y sincronización idempotente de Webhooks de Stripe.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepository: ISubscriptionRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly linksService: LinksService,
    private readonly configService: ConfigService,
  ) {}

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
    const priceId =
      dto.priceId || this.configService.get<string>('STRIPE_PRO_PRICE_ID');

    if (!priceId) {
      throw new BadRequestException(
        'El ID del precio de Stripe (priceId) no fue proporcionado ni configurado en el entorno.',
      );
    }

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

    const portalSession = await this.stripeService.createPortalSession(
      subscription.providerCustomerId,
      effectiveReturnUrl,
    );

    return { url: portalSession.url };
  }

  /**
   * Cancela la suscripción del usuario, actualiza el registro a `'canceled'`
   * y degrada la cuenta automáticamente al plan original `'STARTER'`.
   */
  async cancelSubscription(userId: string): Promise<{
    success: boolean;
    message: string;
    plan: string;
  }> {
    const sub = await this.findByUserId(userId);
    if (sub) {
      if (sub.providerSubscriptionId) {
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
    this.logger.log(`Usuario ${userId} canceló suscripción y volvió a STARTER.`);

    return {
      success: true,
      message:
        'Suscripción cancelada exitosamente. Tu cuenta ha vuelto al plan STARTER.',
      plan: 'STARTER',
    };
  }

  /**
   * Activa el plan PRO directamente (útil para pruebas o modo offline sin Stripe CLI).
   */
  async upgradeToProSimulated(userId: string): Promise<{
    success: boolean;
    message: string;
    plan: string;
  }> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.subscriptionRepository.upsert({
      userId,
      providerName: 'STRIPE',
      providerCustomerId: `cus_sim_${userId.slice(0, 8)}`,
      providerSubscriptionId: `sub_sim_${userId.slice(0, 8)}`,
      providerPriceId: 'price_pro_simulated',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    await this.usersService.updatePlanTier(userId, 'PRO');
    this.logger.log(`Usuario ${userId} activó plan PRO en modo simulado.`);

    return {
      success: true,
      message: 'Plan cambiado exitosamente a PRO.',
      plan: 'PRO',
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
    const customerId = subscription?.providerCustomerId ?? undefined;

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
   * Valida el Feature Flag `ENABLE_PHYSICAL_ORDERS`.
   */
  private assertPhysicalOrdersEnabled(): void {
    const isEnabled =
      this.configService.get<string>('ENABLE_PHYSICAL_ORDERS', 'false') ===
      'true';

    if (!isEnabled) {
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

      if (status === 'active') {
        await this.usersService.updatePlanTier(userId, 'PRO');
        this.logger.log(`Usuario ${userId} promovido a plan 'PRO' exitosamente.`);
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
            providerPaymentIntentId: paymentIntentId,
          });

          this.logger.log(
            `Orden física ${orderId} marcada como 'paid'. Pasa a cola de manufactura.`,
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
        await this.subscriptionRepository.upsert({
          userId,
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          providerName: 'STRIPE',
        });
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
}
