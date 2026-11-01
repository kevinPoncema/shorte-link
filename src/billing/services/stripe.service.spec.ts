import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

describe('StripeService', () => {
  let stripeService: StripeService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService({
      STRIPE_SECRET_KEY: 'sk_test_mock_key',
      STRIPE_WEBHOOK_SECRET: 'whsec_mock_secret',
    });
    stripeService = new StripeService(configService);
  });

  it('initializes Stripe instance and retrieves webhook secret', () => {
    expect(stripeService.getStripeInstance()).toBeDefined();
    expect(stripeService.getWebhookSecret()).toBe('whsec_mock_secret');
  });

  it('delegates constructWebhookEvent to stripe.webhooks.constructEvent', () => {
    const stripeInstance = stripeService.getStripeInstance();
    const constructSpy = jest
      .spyOn(stripeInstance.webhooks, 'constructEvent')
      .mockReturnValue({ id: 'evt_1', type: 'test' } as any);

    const payload = Buffer.from('{"test": true}');
    const signature = 'sig_123';

    const event = stripeService.constructWebhookEvent(payload, signature);

    expect(constructSpy).toHaveBeenCalledWith(
      payload,
      signature,
      'whsec_mock_secret',
    );
    expect(event).toEqual({ id: 'evt_1', type: 'test' });
  });

  it('findOrCreateCustomer returns existing customer if found', async () => {
    const stripeInstance = stripeService.getStripeInstance();
    const listSpy = jest
      .spyOn(stripeInstance.customers, 'list')
      .mockResolvedValue({
        data: [{ id: 'cus_existing', email: 'test@mail.com' }],
      } as any);

    const customer = await stripeService.findOrCreateCustomer(
      'test@mail.com',
      'user-1',
    );

    expect(listSpy).toHaveBeenCalledWith({ email: 'test@mail.com', limit: 1 });
    expect(customer.id).toBe('cus_existing');
  });

  it('findOrCreateCustomer creates new customer if not found', async () => {
    const stripeInstance = stripeService.getStripeInstance();
    jest.spyOn(stripeInstance.customers, 'list').mockResolvedValue({
      data: [],
    } as any);
    const createSpy = jest
      .spyOn(stripeInstance.customers, 'create')
      .mockResolvedValue({
        id: 'cus_created',
        email: 'new@mail.com',
      } as any);

    const customer = await stripeService.findOrCreateCustomer(
      'new@mail.com',
      'user-2',
    );

    expect(createSpy).toHaveBeenCalledWith({
      email: 'new@mail.com',
      metadata: { userId: 'user-2' },
    });
    expect(customer.id).toBe('cus_created');
  });

  it('createSubscriptionCheckoutSession calls sessions.create with subscription mode', async () => {
    const stripeInstance = stripeService.getStripeInstance();
    const createSessionSpy = jest
      .spyOn(stripeInstance.checkout.sessions, 'create')
      .mockResolvedValue({
        id: 'cs_sub_1',
        url: 'https://checkout.stripe.com/cs_sub_1',
      } as any);

    const res = await stripeService.createSubscriptionCheckoutSession({
      customerId: 'cus_1',
      priceId: 'price_1',
      successUrl: 'https://test.com/success',
      cancelUrl: 'https://test.com/cancel',
      userId: 'user-1',
    });

    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_1',
        success_url: 'https://test.com/success',
        cancel_url: 'https://test.com/cancel',
      }),
    );
    expect(res.url).toBe('https://checkout.stripe.com/cs_sub_1');
  });

  it('createPortalSession calls billingPortal.sessions.create', async () => {
    const stripeInstance = stripeService.getStripeInstance();
    const createPortalSpy = jest
      .spyOn(stripeInstance.billingPortal.sessions, 'create')
      .mockResolvedValue({
        id: 'portal_1',
        url: 'https://billing.stripe.com/portal_1',
      } as any);

    const res = await stripeService.createPortalSession(
      'cus_1',
      'https://test.com/return',
    );

    expect(createPortalSpy).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://test.com/return',
    });
    expect(res.url).toBe('https://billing.stripe.com/portal_1');
  });

  it('createPaymentCheckoutSession calls sessions.create with payment mode', async () => {
    const stripeInstance = stripeService.getStripeInstance();
    const createSessionSpy = jest
      .spyOn(stripeInstance.checkout.sessions, 'create')
      .mockResolvedValue({
        id: 'cs_pay_1',
        url: 'https://checkout.stripe.com/cs_pay_1',
      } as any);

    const res = await stripeService.createPaymentCheckoutSession({
      customerId: 'cus_1',
      orderId: 'order-1',
      userId: 'user-1',
      lineItems: [],
      successUrl: 'https://test.com/success',
      cancelUrl: 'https://test.com/cancel',
    });

    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer: 'cus_1',
        metadata: {
          orderId: 'order-1',
          userId: 'user-1',
        },
      }),
    );
    expect(res.url).toBe('https://checkout.stripe.com/cs_pay_1');
  });
});
