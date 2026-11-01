import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeConstructor = require('stripe');

/**
 * Servicio de infraestructura que encapsula el SDK oficial de Stripe.
 * Expone métodos limpios y desacoplados para la gestión de clientes, Checkout y Customer Portal.
 */
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

  /**
   * Obtiene la instancia directa del SDK de Stripe para operaciones avanzadas.
   */
  getStripeInstance(): Stripe {
    return this.stripe;
  }

  /**
   * Retorna el secreto configurado para la verificación de firma HMAC de webhooks.
   */
  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  /**
   * Busca un cliente en Stripe por su email o crea uno nuevo vinculando el `userId` en los metadatos.
   */
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

  /**
   * Crea una sesión de Stripe Checkout en modo recurrente (`subscription`).
   */
  async createSubscriptionCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    userId: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      customer: params.customerId,
      mode: 'subscription',
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
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
    });
  }

  /**
   * Crea una sesión en Stripe Customer Portal para que el usuario gestione su suscripción.
   */
  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /**
   * Crea una sesión de Stripe Checkout en modo un solo pago (`payment`) para insumos físicos.
   */
  async createPaymentCheckoutSession(params: {
    customerId?: string;
    customerEmail?: string;
    orderId: string;
    userId: string;
    lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
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

    return this.stripe.checkout.sessions.create(sessionParams);
  }

  /**
   * Valida criptográficamente la firma HMAC del webhook recibido y construye el objeto `Stripe.Event`.
   */
  constructWebhookEvent(
    payload: Buffer | string,
    signature: string,
    secret?: string,
  ): Stripe.Event {
    const webhookSecret = secret || this.webhookSecret;
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
