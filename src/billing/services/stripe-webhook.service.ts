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
import { Subscription, SubscriptionStatus } from '../models/subscription.entity';
import { StripeService } from './stripe.service';

interface ExtractedSubscriptionDetails {
  subscriptionId: string;
  customerId: string;
  priceId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

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

  async handleWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true }> {
    const event = this.verifyAndParseWebhookEvent(rawBody, signature);
    this.logger.log(`Procesando Stripe Webhook Event: ${event.type}`);
    await this.dispatchWebhookEvent(event);
    return { received: true };
  }

  async handleSubscriptionCreatedOrUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const details = this.extractSubscriptionDetails(stripeSub);
    const userId = await this.resolveUserIdFromStripe(
      stripeSub.metadata?.userId,
      details.customerId,
      details.subscriptionId,
    );

    if (!userId) {
      this.logger.warn(
        `No se pudo vincular la suscripción ${details.subscriptionId} con un userId interno.`,
      );
      return;
    }

    await this.subscriptionRepository.upsert({
      userId,
      providerName: 'STRIPE',
      providerCustomerId: details.customerId,
      providerSubscriptionId: details.subscriptionId,
      providerPriceId: details.priceId,
      status: details.status,
      currentPeriodStart: details.currentPeriodStart,
      currentPeriodEnd: details.currentPeriodEnd,
      cancelAtPeriodEnd: details.cancelAtPeriodEnd,
    });

    await this.syncUserPlanOnSubscriptionState(userId, details.status);
  }

  async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const { subscriptionId, customerId } =
      this.extractSubscriptionIdentifiers(stripeSub);

    const existing = await this.findSubscriptionByIdOrCustomerId(
      subscriptionId,
      customerId,
    );

    const userId =
      existing?.userId ??
      (await this.resolveUserIdFromStripe(
        stripeSub.metadata?.userId,
        customerId,
        subscriptionId,
      ));

    await this.persistSubscriptionCancellation(
      existing,
      userId,
      customerId,
      subscriptionId,
    );

    await this.downgradeUserToStarter(userId);
  }

  async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.mode === 'payment') {
      await this.handleCompletedPaymentSession(session);
    } else if (session.mode === 'subscription') {
      await this.handleCompletedSubscriptionSession(session);
    }
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = this.extractInvoiceSubscriptionId(invoice);
    if (!subscriptionId) {
      return;
    }

    const subscription =
      await this.subscriptionRepository.findBySubscriptionId(subscriptionId);
    if (subscription) {
      subscription.status = 'past_due';
      await this.subscriptionRepository.save(subscription);
      this.logger.warn(
        `Cobro fallido en factura ${invoice.id}. Suscripción ${subscriptionId} marcada como 'past_due'.`,
      );
    }
  }

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

      return this.retrieveUserIdFromStripeCustomer(customerId);
    }

    return null;
  }

  private verifyAndParseWebhookEvent(
    rawBody: Buffer | string,
    signature: string,
  ): Stripe.Event {
    try {
      return this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err: any) {
      this.logger.error(`Firma de Webhook de Stripe inválida: ${err.message}`);
      throw new BadRequestException(
        `Firma de Webhook inválida: ${err.message}`,
      );
    }
  }

  private async dispatchWebhookEvent(event: Stripe.Event): Promise<void> {
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
  }

  private extractSubscriptionDetails(
    stripeSub: Stripe.Subscription,
  ): ExtractedSubscriptionDetails {
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

    return {
      subscriptionId,
      customerId,
      priceId,
      status,
      currentPeriodStart: rawPeriodStart ? new Date(rawPeriodStart * 1000) : null,
      currentPeriodEnd: rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
    };
  }

  private extractSubscriptionIdentifiers(stripeSub: Stripe.Subscription): {
    subscriptionId: string;
    customerId: string;
  } {
    const subscriptionId = stripeSub.id;
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;
    return { subscriptionId, customerId };
  }

  private async findSubscriptionByIdOrCustomerId(
    subscriptionId: string,
    customerId: string,
  ): Promise<Subscription | null> {
    return (
      (await this.subscriptionRepository.findBySubscriptionId(subscriptionId)) ??
      (await this.subscriptionRepository.findByCustomerId(customerId))
    );
  }

  private async syncUserPlanOnSubscriptionState(
    userId: string,
    status: SubscriptionStatus,
  ): Promise<void> {
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
  }

  private async persistSubscriptionCancellation(
    existing: Subscription | null,
    userId: string | null,
    customerId: string,
    subscriptionId: string,
  ): Promise<void> {
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
  }

  private async downgradeUserToStarter(userId: string | null): Promise<void> {
    if (userId) {
      await this.usersService.updatePlanTier(userId, 'STARTER');
      this.logger.log(
        `Suscripción cancelada. Usuario ${userId} degradado a plan 'STARTER'.`,
      );
    }
  }

  private async handleCompletedPaymentSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      return;
    }

    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      return;
    }

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

  private async handleCompletedSubscriptionSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.metadata?.userId;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;

    if (!userId || !subscriptionId || !customerId) {
      return;
    }

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

  private extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
    const rawSub =
      (invoice as any).subscription ??
      (invoice as any).subscription_details?.subscription;
    return typeof rawSub === 'string' ? rawSub : rawSub?.id;
  }

  private async retrieveUserIdFromStripeCustomer(
    customerId: string,
  ): Promise<string | null> {
    try {
      const stripeCustomer =
        await this.stripeService.getStripeInstance().customers.retrieve(customerId);
      if (
        !stripeCustomer.deleted &&
        (stripeCustomer as Stripe.Customer).metadata?.userId
      ) {
        return (stripeCustomer as Stripe.Customer).metadata.userId;
      }
    } catch {
      // Fallback silencioso si no se puede recuperar el cliente
    }
    return null;
  }
}
