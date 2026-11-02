import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { UsersService } from '../../core/auth/services/users.service';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../interfaces/order-repository.interface';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../interfaces/subscription-repository.interface';
import { SubscriptionStatus } from '../models/subscription.entity';
import { StripeService } from './stripe.service';

/**
 * Servicio especializado en la recepción, verificación criptográfica y despacho
 * asíncrono de eventos de Webhook de Stripe.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepository: ISubscriptionRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Procesa un webhook de Stripe verificando su firma HMAC contra el buffer crudo.
   */
  async handleWebhook(
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

  /**
   * Manejador de eventos de creación o actualización de suscripciones.
   */
  async handleSubscriptionCreatedOrUpdated(
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
   */
  async handleSubscriptionDeleted(
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
   */
  async handleCheckoutSessionCompleted(
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
  async handleInvoicePaymentFailed(
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
  async resolveUserIdFromStripe(
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
