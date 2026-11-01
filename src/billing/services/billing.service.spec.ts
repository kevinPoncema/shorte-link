import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../core/auth/services/users.service';
import { LinksService } from '../../core/links/services/links.service';
import { BillingController } from '../controllers/billing.controller';
import { IOrderRepository } from '../interfaces/order-repository.interface';
import { ISubscriptionRepository } from '../interfaces/subscription-repository.interface';
import { Order } from '../models/order.entity';
import { Subscription } from '../models/subscription.entity';
import { TypeOrmSubscriptionRepository } from '../repositories/typeorm-subscription.repository';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

describe('BillingService, Repositories, Stripe Integration & BillingController', () => {
  let billingService: BillingService;
  let billingController: BillingController;
  let subscriptionRepository: ISubscriptionRepository;
  let orderRepository: jest.Mocked<IOrderRepository>;
  let stripeService: jest.Mocked<StripeService>;
  let usersService: jest.Mocked<UsersService>;
  let linksService: jest.Mocked<LinksService>;
  let configService: ConfigService;

  let storedSubscriptions: Subscription[];
  let storedOrders: Order[];

  const userWithSub: JwtPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'pro@empresa.com',
    plan: 'DEFAULT',
  };

  const userWithoutSub: JwtPayload = {
    sub: '22222222-2222-4222-8222-222222222222',
    email: 'free@empresa.com',
    plan: 'DEFAULT',
  };

  beforeEach(() => {
    storedSubscriptions = [
      {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        userId: userWithSub.sub,
        user: {} as never,
        providerName: 'STRIPE',
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_123',
        providerPriceId: 'price_pro_month',
        status: 'active',
        currentPeriodStart: new Date('2026-11-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2026-10-31T00:00:00.000Z'),
        updatedAt: new Date('2026-10-31T00:00:00.000Z'),
      },
    ];

    storedOrders = [];

    const ormRepoMock = {
      findOne: jest.fn(async ({ where }: { where: any }) => {
        if (where.userId) {
          return storedSubscriptions.find((s) => s.userId === where.userId) ?? null;
        }
        if (where.providerCustomerId) {
          return (
            storedSubscriptions.find(
              (s) => s.providerCustomerId === where.providerCustomerId,
            ) ?? null
          );
        }
        if (where.providerSubscriptionId) {
          return (
            storedSubscriptions.find(
              (s) => s.providerSubscriptionId === where.providerSubscriptionId,
            ) ?? null
          );
        }
        return null;
      }),
      save: jest.fn(async (sub: Partial<Subscription>) => {
        const existing = storedSubscriptions.find((s) => s.userId === sub.userId);
        if (existing) {
          Object.assign(existing, sub);
          return existing;
        }
        const created = {
          id: 'sub-new-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...sub,
        } as Subscription;
        storedSubscriptions.push(created);
        return created;
      }),
      create: jest.fn((sub: Partial<Subscription>) => ({
        id: 'sub-new-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...sub,
      })),
    };

    subscriptionRepository = new TypeOrmSubscriptionRepository(
      ormRepoMock as never,
    );

    orderRepository = {
      findById: jest.fn(async (id: string) => {
        return storedOrders.find((o) => o.id === id) ?? null;
      }),
      findByUserId: jest.fn(async (userId: string) => {
        return storedOrders.filter((o) => o.userId === userId);
      }),
      findByPaymentIntentId: jest.fn(async (pi: string) => {
        return storedOrders.find((o) => o.providerPaymentIntentId === pi) ?? null;
      }),
      createAndSave: jest.fn(async (orderData: Partial<Order>) => {
        const order: Order = {
          id: 'order-123',
          userId: orderData.userId!,
          providerPaymentIntentId: null,
          totalAmount: orderData.totalAmount!,
          currency: 'USD',
          paymentStatus: orderData.paymentStatus || 'pending',
          fulfillmentStatus: orderData.fulfillmentStatus || 'unfulfilled',
          shippingAddress: orderData.shippingAddress ?? null,
          items: (orderData.items as any) ?? [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        storedOrders.push(order);
        return order;
      }),
      update: jest.fn(async (id: string, partial: Partial<Order>) => {
        const order = storedOrders.find((o) => o.id === id);
        if (order) {
          Object.assign(order, partial);
        }
      }),
    };

    stripeService = {
      getStripeInstance: jest.fn(() => ({
        customers: {
          retrieve: jest.fn(),
        },
      })) as any,
      getWebhookSecret: jest.fn(() => 'whsec_test'),
      findOrCreateCustomer: jest.fn(async (email: string, userId: string) => ({
        id: 'cus_test_123',
        email,
        metadata: { userId },
      })) as any,
      createSubscriptionCheckoutSession: jest.fn(async () => ({
        id: 'cs_sub_123',
        url: 'https://checkout.stripe.com/pay/cs_sub_123',
      })) as any,
      createPortalSession: jest.fn(async () => ({
        id: 'pts_123',
        url: 'https://billing.stripe.com/p/session/pts_123',
      })) as any,
      createPaymentCheckoutSession: jest.fn(async () => ({
        id: 'cs_pay_order_123',
        url: 'https://checkout.stripe.com/pay/cs_pay_order_123',
      })) as any,
      constructWebhookEvent: jest.fn(),
    } as any;

    usersService = {
      findById: jest.fn(),
      updatePlanTier: jest.fn(),
    } as any;

    linksService = {
      findOneByUser: jest.fn(async (userId: string, linkId: string) => ({
        id: linkId,
        userId,
      })) as any,
    } as any;

    configService = new ConfigService({
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRO_PRICE_ID: 'price_default_pro',
      ENABLE_PHYSICAL_ORDERS: 'true',
      PRICE_ACRYLIC_STAND: '15.00',
      PRICE_NFC_STICKER: '5.00',
      APP_BASE_URL: 'https://app.midominio.com',
    });

    billingService = new BillingService(
      subscriptionRepository,
      orderRepository,
      stripeService,
      usersService,
      linksService,
      configService,
    );

    billingController = new BillingController(billingService);
  });

  describe('GET /billing/subscription', () => {
    it('returns active subscription when user has one (Happy Path)', async () => {
      const res = await billingController.getCurrentSubscription(userWithSub);
      expect(res.subscription).not.toBeNull();
      expect(res.subscription?.status).toBe('active');
      expect(res.subscription?.providerCustomerId).toBe('cus_123');
    });

    it('returns null subscription cleanly when user has no external billing record (Edge Case)', async () => {
      const res = await billingController.getCurrentSubscription(userWithoutSub);
      expect(res).toEqual({ subscription: null });
    });
  });

  describe('POST /billing/checkout/subscription', () => {
    it('creates checkout session and persists incomplete subscription record', async () => {
      const res = await billingController.createSubscriptionCheckout(
        userWithoutSub,
        {
          priceId: 'price_custom_pro',
          successUrl: 'https://app.com/success',
          cancelUrl: 'https://app.com/cancel',
        },
      );

      expect(res.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_sub_123');
      expect(stripeService.findOrCreateCustomer).toHaveBeenCalledWith(
        userWithoutSub.email,
        userWithoutSub.sub,
      );
      expect(stripeService.createSubscriptionCheckoutSession).toHaveBeenCalledWith({
        customerId: 'cus_test_123',
        priceId: 'price_custom_pro',
        successUrl: 'https://app.com/success',
        cancelUrl: 'https://app.com/cancel',
        userId: userWithoutSub.sub,
      });

      const updatedSub = storedSubscriptions.find(
        (s) => s.userId === userWithoutSub.sub,
      );
      expect(updatedSub?.status).toBe('incomplete');
      expect(updatedSub?.providerCustomerId).toBe('cus_test_123');
    });

    it('throws BadRequestException if priceId is absent from DTO and environment', async () => {
      const emptyConfig = new ConfigService({});
      const serviceNoPrice = new BillingService(
        subscriptionRepository,
        orderRepository,
        stripeService,
        usersService,
        linksService,
        emptyConfig,
      );

      await expect(
        serviceNoPrice.createSubscriptionCheckout(userWithoutSub, {
          successUrl: 'https://app.com/success',
          cancelUrl: 'https://app.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /billing/portal', () => {
    it('returns portal session URL when user has registered subscription', async () => {
      const res = await billingController.getCustomerPortal(
        userWithSub,
        'https://app.com/return',
      );
      expect(res.url).toBe('https://billing.stripe.com/p/session/pts_123');
      expect(stripeService.createPortalSession).toHaveBeenCalledWith(
        'cus_123',
        'https://app.com/return',
      );
    });

    it('throws BadRequestException when user has no billing record', async () => {
      await expect(
        billingController.getCustomerPortal(userWithoutSub),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /billing/checkout/physical', () => {
    it('throws ForbiddenException when ENABLE_PHYSICAL_ORDERS is false', async () => {
      const disabledConfig = new ConfigService({
        ENABLE_PHYSICAL_ORDERS: 'false',
      });
      const disabledService = new BillingService(
        subscriptionRepository,
        orderRepository,
        stripeService,
        usersService,
        linksService,
        disabledConfig,
      );

      await expect(
        disabledService.createPhysicalOrderCheckout(userWithSub, {
          items: [{ itemType: 'acrylic_stand', quantity: 1 }],
          shippingAddress: {
            fullName: 'Test User',
            addressLine1: 'Test St',
            city: 'SPS',
            phone: '12345678',
          },
          successUrl: 'https://app.com/success',
          cancelUrl: 'https://app.com/cancel',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates linkId ownership and throws NotFoundException when link not owned', async () => {
      linksService.findOneByUser.mockRejectedValueOnce(
        new NotFoundException('Link not found'),
      );

      await expect(
        billingController.createPhysicalOrderCheckout(userWithSub, {
          items: [
            {
              linkId: 'non-existent-link-id',
              itemType: 'acrylic_stand',
              quantity: 1,
            },
          ],
          shippingAddress: {
            fullName: 'Test User',
            addressLine1: 'Test St',
            city: 'SPS',
            phone: '12345678',
          },
          successUrl: 'https://app.com/success',
          cancelUrl: 'https://app.com/cancel',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('calculates total using backend prices, creates order, and returns checkoutUrl', async () => {
      const res = await billingController.createPhysicalOrderCheckout(userWithSub, {
        items: [
          {
            linkId: 'b1b22e11-897c-48c9-9eb1-8848db929c8e',
            itemType: 'acrylic_stand',
            quantity: 2, // 2 * 15 = 30
          },
          {
            itemType: 'nfc_sticker',
            quantity: 1, // 1 * 5 = 5
          },
        ],
        shippingAddress: {
          fullName: 'Juan Pérez',
          addressLine1: 'Barrio Guamilito',
          city: 'San Pedro Sula',
          phone: '+50499999999',
        },
        successUrl: 'https://app.com/orders/success',
        cancelUrl: 'https://app.com/orders/cancel',
      });

      expect(res.checkoutUrl).toBe(
        'https://checkout.stripe.com/pay/cs_pay_order_123',
      );
      expect(orderRepository.createAndSave).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userWithSub.sub,
          totalAmount: 35.0,
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
        }),
      );
      expect(orderRepository.update).toHaveBeenCalledWith(
        'order-123',
        { providerPaymentIntentId: 'cs_pay_order_123' },
      );
    });

    it('throws BadRequestException on unsupported itemType', async () => {
      await expect(
        billingController.createPhysicalOrderCheckout(userWithSub, {
          items: [
            {
              itemType: 'invalid_type',
              quantity: 1,
            },
          ],
          shippingAddress: {
            fullName: 'Juan Pérez',
            addressLine1: 'Barrio Guamilito',
            city: 'San Pedro Sula',
            phone: '+50499999999',
          },
          successUrl: 'https://app.com/orders/success',
          cancelUrl: 'https://app.com/orders/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('emits a direct physical order and calculates total correctly', async () => {
      const order = await billingController.createDirectPhysicalOrder(userWithSub, {
        items: [
          {
            linkId: 'link-abc',
            itemType: 'plastic_card',
            quantity: 3,
            specifications: { color: 'matte_black', chips: 'NTAG213' },
          },
          {
            linkId: 'link-abc',
            itemType: 'acrylic_stand',
            quantity: 1,
            specifications: { color: 'transparent' },
          },
        ],
        shippingAddress: {
          fullName: 'Juan Perez',
          addressLine1: 'Col. Palmira',
          city: 'Tegucigalpa',
          phone: '+50499887766',
        },
      });

      expect(order).toBeDefined();
      expect(order.paymentStatus).toBe('paid');
      expect(order.fulfillmentStatus).toBe('in_production');
      // 3 * 10 + 1 * 15 = 45.00
      expect(order.totalAmount).toBe(45);
    });

    it('retrieves user physical orders list', async () => {
      await billingController.createDirectPhysicalOrder(userWithSub, {
        items: [
          {
            linkId: 'link-abc',
            itemType: 'acrylic_stand',
            quantity: 1,
          },
        ],
        shippingAddress: {
          fullName: 'Juan Perez',
          addressLine1: 'Col. Palmira',
          city: 'Tegucigalpa',
          phone: '+50499887766',
        },
      });

      const orders = await billingController.getOrders(userWithSub);
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].userId).toBe(userWithSub.sub);
    });
  });

  describe('POST /billing/webhook', () => {
    it('throws BadRequestException if stripe-signature is absent', async () => {
      const mockReq = { rawBody: Buffer.from('{}') } as any;

      await expect(
        billingController.handleWebhook(mockReq, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if HMAC verification fails in constructWebhookEvent', async () => {
      stripeService.constructWebhookEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const mockReq = { rawBody: Buffer.from('{}') } as any;

      await expect(
        billingController.handleWebhook(mockReq, 'sig_invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('processes customer.subscription.updated to active and updates user plan to PRO', async () => {
      stripeService.constructWebhookEvent.mockReturnValueOnce({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: {
              data: [
                {
                  price: { id: 'price_pro' },
                  current_period_start: 1700000000,
                  current_period_end: 1702592000,
                },
              ],
            },
            cancel_at_period_end: false,
            metadata: {
              userId: userWithSub.sub,
            },
          },
        },
      } as any);

      const mockReq = { rawBody: Buffer.from('{}') } as any;
      const res = await billingController.handleWebhook(mockReq, 'sig_valid');

      expect(res).toEqual({ received: true });
      expect(usersService.updatePlanTier).toHaveBeenCalledWith(
        userWithSub.sub,
        'PRO',
      );
    });

    it('processes customer.subscription.deleted and downgrades user plan to STARTER', async () => {
      stripeService.constructWebhookEvent.mockReturnValueOnce({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            metadata: {
              userId: userWithSub.sub,
            },
          },
        },
      } as any);

      const mockReq = { rawBody: Buffer.from('{}') } as any;
      const res = await billingController.handleWebhook(mockReq, 'sig_valid');

      expect(res).toEqual({ received: true });
      expect(usersService.updatePlanTier).toHaveBeenCalledWith(
        userWithSub.sub,
        'STARTER',
      );
      const sub = storedSubscriptions.find((s) => s.userId === userWithSub.sub);
      expect(sub?.status).toBe('canceled');
    });

    it('processes checkout.session.completed (mode: payment) and marks order as paid', async () => {
      storedOrders.push({
        id: 'order-999',
        userId: userWithSub.sub,
        providerPaymentIntentId: 'cs_test_999',
        totalAmount: 30,
        currency: 'USD',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        shippingAddress: null,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      stripeService.constructWebhookEvent.mockReturnValueOnce({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_999',
            mode: 'payment',
            payment_intent: 'pi_real_12345',
            metadata: {
              orderId: 'order-999',
            },
          },
        },
      } as any);

      const mockReq = { rawBody: Buffer.from('{}') } as any;
      const res = await billingController.handleWebhook(mockReq, 'sig_valid');

      expect(res).toEqual({ received: true });
      expect(orderRepository.update).toHaveBeenCalledWith(
        'order-999',
        expect.objectContaining({
          paymentStatus: 'paid',
          providerPaymentIntentId: 'pi_real_12345',
        }),
      );
    });

    it('processes invoice.payment_failed and marks subscription as past_due', async () => {
      stripeService.constructWebhookEvent.mockReturnValueOnce({
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_fail_123',
            subscription: 'sub_123',
            customer: 'cus_123',
          },
        },
      } as any);

      const mockReq = { rawBody: Buffer.from('{}') } as any;
      const res = await billingController.handleWebhook(mockReq, 'sig_valid');

      expect(res).toEqual({ received: true });
      const sub = storedSubscriptions.find((s) => s.userId === userWithSub.sub);
      expect(sub?.status).toBe('past_due');
    });
  });
});
