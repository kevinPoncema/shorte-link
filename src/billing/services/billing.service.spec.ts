import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
import { BillingController } from '../controllers/billing.controller';
import { Subscription } from '../models/subscription.entity';
import { BillingService } from './billing.service';

describe('BillingService & BillingController', () => {
  let billingService: BillingService;
  let billingController: BillingController;
  let storedSubscriptions: Subscription[];

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
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_123',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
        createdAt: new Date('2026-10-31T00:00:00.000Z'),
        updatedAt: new Date('2026-10-31T00:00:00.000Z'),
      },
    ];

    const repoMock = {
      findOne: jest.fn(async ({ where }: { where: { userId: string } }) =>
        storedSubscriptions.find((s) => s.userId === where.userId) ?? null,
      ),
    };

    billingService = new BillingService(repoMock as never);
    billingController = new BillingController(billingService);
  });

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
