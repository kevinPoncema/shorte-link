import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeConstructor = require('stripe');

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') || 'sk_test_placeholder';
    this.webhookSecret =
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || 'whsec_placeholder';

    const Client = StripeConstructor.default || StripeConstructor;
    this.stripe = new Client(apiKey, {
      apiVersion: '2025-02-24.acacia' as any,
      typescript: true,
    });
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }

  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  async findOrCreateCustomer(
    email: string,
    userId: string,
  ): Promise<Stripe.Customer> {
    const existing = await this.stripe.customers.list({
      email,
      limit: 1,
    });

    if (existing.data.length > 0) {
      return existing.data[0];
    }

    return this.stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });
  }

  async createSubscriptionCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    userId: string;
  }): Promise<Stripe.Checkout.Session> {
    const normalizedPrice = params.priceId.trim();
    const baseSessionParams = this.buildBaseSubscriptionSessionParams(params);

    if (this.isMockPriceId(normalizedPrice)) {
      return this.createDynamicSubscriptionSession(baseSessionParams);
    }

    return this.createPricedSubscriptionSession(baseSessionParams, normalizedPrice);
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async createPaymentCheckoutSession(params: {
    customerId?: string;
    customerEmail?: string;
    orderId: string;
    userId: string;
    lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    const sessionParams = this.buildPaymentSessionParams(params);
    return this.stripe.checkout.sessions.create(sessionParams);
  }

  constructWebhookEvent(
    payload: Buffer | string,
    signature: string,
    secret?: string,
  ): Stripe.Event {
    const webhookSecret = secret || this.webhookSecret;
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  private isMockPriceId(priceId: string): boolean {
    const lower = priceId.toLowerCase();
    return (
      lower.includes('mock') ||
      lower.includes('placeholder') ||
      lower.includes('simulated')
    );
  }

  private buildBaseSubscriptionSessionParams(params: {
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    userId: string;
  }): Stripe.Checkout.SessionCreateParams {
    return {
      customer: params.customerId,
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
      },
      subscription_data: {
        metadata: {
          userId: params.userId,
        },
      },
    };
  }

  private async createPricedSubscriptionSession(
    baseParams: Stripe.Checkout.SessionCreateParams,
    normalizedPrice: string,
  ): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.create({
        ...baseParams,
        line_items: [{ price: normalizedPrice, quantity: 1 }],
      });
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (err?.code === 'resource_missing' || msg.includes('no such price')) {
        this.logger.warn(
          `El priceId '${normalizedPrice}' no existe en Stripe; creando sesión Checkout con price_data dinámico ($19/mes).`,
        );
        return this.createDynamicSubscriptionSession(baseParams);
      }
      throw err;
    }
  }

  private createDynamicSubscriptionSession(
    baseParams: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      ...baseParams,
      line_items: [this.buildDynamicPriceLineItem()],
    });
  }

  private buildDynamicPriceLineItem(): Stripe.Checkout.SessionCreateParams.LineItem {
    return {
      price_data: {
        currency: 'usd',
        unit_amount: 1900,
        recurring: { interval: 'month' },
        product_data: {
          name: 'Plan PRO — QR Maker SaaS',
          description:
            'Hasta 50 enlaces dinámicos activos, QR personalizado y analíticas de 365 días.',
        },
      },
      quantity: 1,
    };
  }

  private buildPaymentSessionParams(params: {
    customerId?: string;
    customerEmail?: string;
    orderId: string;
    userId: string;
    lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    successUrl: string;
    cancelUrl: string;
  }): Stripe.Checkout.SessionCreateParams {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: params.lineItems,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        orderId: params.orderId,
        userId: params.userId,
      },
    };

    if (params.customerId) {
      sessionParams.customer = params.customerId;
    } else if (params.customerEmail) {
      sessionParams.customer_email = params.customerEmail;
    }

    return sessionParams;
  }
}
