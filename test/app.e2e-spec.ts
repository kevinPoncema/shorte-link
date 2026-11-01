import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { BillingController } from '../src/billing/controllers/billing.controller';
import { ORDER_REPOSITORY } from '../src/billing/interfaces/order-repository.interface';
import { SUBSCRIPTION_REPOSITORY } from '../src/billing/interfaces/subscription-repository.interface';
import { Order } from '../src/billing/models/order.entity';
import { Subscription } from '../src/billing/models/subscription.entity';
import { TypeOrmOrderRepository } from '../src/billing/repositories/typeorm-order.repository';
import { TypeOrmSubscriptionRepository } from '../src/billing/repositories/typeorm-subscription.repository';
import { BillingService } from '../src/billing/services/billing.service';
import { StripeService } from '../src/billing/services/stripe.service';
import { AuthController } from '../src/core/auth/controllers/auth.controller';
import { JwtAuthGuard } from '../src/core/auth/guards/jwt-auth.guard';
import { JwtPayload } from '../src/core/auth/interfaces/jwt-payload.interface';
import { USER_REPOSITORY } from '../src/core/auth/interfaces/user-repository.interface';
import { TypeOrmUserRepository } from '../src/core/auth/repositories/typeorm-user.repository';
import { AuthService } from '../src/core/auth/services/auth.service';
import { UsersService } from '../src/core/auth/services/users.service';
import {
  CLICKS_QUEUE_KEY,
  CacheService,
  REDIS_CLIENT,
} from '../src/core/cache/cache.service';
import { LinksController } from '../src/core/links/controllers/links.controller';
import { RedirectController } from '../src/core/links/controllers/redirect.controller';
import {
  ILinkEventRepository,
  LINK_EVENT_REPOSITORY,
} from '../src/core/links/interfaces/link-event-repository.interface';
import { LINK_REPOSITORY } from '../src/core/links/interfaces/link-repository.interface';
import { TypeOrmLinkRepository } from '../src/core/links/repositories/typeorm-link.repository';
import { LinkStatsService } from '../src/core/links/services/link-stats.service';
import { LinksService } from '../src/core/links/services/links.service';
import { Link } from '../src/core/models/link.entity';
import { User } from '../src/core/models/user.entity';
import { JWT_BEARER_AUTH, setupOpenApi } from '../src/openapi.config';
import { PLAN_REPOSITORY } from '../src/plans/interfaces/plan-repository.interface';
import { PLAN_STRATEGIES } from '../src/plans/interfaces/plan-strategy.interface';
import { Plan } from '../src/plans/models/plan.entity';
import { TypeOrmPlanRepository } from '../src/plans/repositories/typeorm-plan.repository';
import { PlanContextService } from '../src/plans/services/plan-context.service';
import { PlanSeeder } from '../src/plans/seeders/plan.seeder';
import { ProPlanStrategy } from '../src/plans/strategies/pro-plan.strategy';
import { StarterPlanStrategy } from '../src/plans/strategies/starter-plan.strategy';

describe('Dynamic QR & Link Shortener API (Fastify E2E - Happy, Sad & Edge Cases)', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;

  const redisKV = new Map<string, string>();
  const redisLists = new Map<string, string[]>();

  const inMemoryRedis = {
    status: 'ready',
    config: jest.fn(async () => 'OK'),
    get: jest.fn(async (key: string) => redisKV.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      redisKV.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      const existed = redisKV.delete(key);
      return existed ? 1 : 0;
    }),
    lpush: jest.fn(async (key: string, value: string) => {
      const list = redisLists.get(key) ?? [];
      list.unshift(value);
      redisLists.set(key, list);
      return list.length;
    }),
    quit: jest.fn(async () => 'OK'),
    disconnect: jest.fn(),
  };

  const usersStore: User[] = [];
  const plansStore: Plan[] = [];
  const linksStore: Link[] = [];
  const subscriptionsStore: Subscription[] = [];
  const ordersStore: Order[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-fastify-secret';
    process.env.BCRYPT_SALT_ROUNDS = '4';
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.SWAGGER_PATH = 'docs';
    process.env.STRIPE_PRO_PRICE_ID = 'price_e2e_pro';
    process.env.ENABLE_PHYSICAL_ORDERS = 'true';

    const usersRepo = {
      findOne: async ({ where }: { where: { email?: string; id?: string } }) =>
        usersStore.find(
          (u) =>
            (where.email === undefined || u.email === where.email) &&
            (where.id === undefined || u.id === where.id),
        ) ?? null,
      create: (partial: Partial<User>) =>
        ({
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...partial,
        }) as User,
      save: async (user: User) => {
        if (user.planId && !plansStore.some((p) => p.id === user.planId)) {
          throw new Error(
            `Key (plan_id)=(${user.planId}) is not present in table "plans".`,
          );
        }
        usersStore.push(user);
        return user;
      },
      update: async ({ id }: { id: string }, partial: Partial<User>) => {
        if (
          partial.planId &&
          !plansStore.some((p) => p.id === partial.planId)
        ) {
          throw new Error(
            `Key (plan_id)=(${partial.planId}) is not present in table "plans".`,
          );
        }
        const existing = usersStore.find((u) => u.id === id);
        if (existing) {
          Object.assign(existing, partial, { updatedAt: new Date() });
        }
      },
      createQueryBuilder: () => {
        let email = '';
        const qb = {
          addSelect: () => qb,
          where: (_q: string, params: { email: string }) => {
            email = params.email;
            return qb;
          },
          getOne: async () =>
            usersStore.find((u) => u.email === email) ?? null,
        };
        return qb;
      },
    };

    const plansRepo = {
      find: async () => [...plansStore],
      findOne: async ({ where }: { where: { id: string } }) =>
        plansStore.find((p) => p.id === where.id) ?? null,
      create: (partial: Partial<Plan>) => partial as Plan,
      save: async (plan: Plan) => {
        plansStore.push(plan);
        return plan;
      },
    };

    const linksRepo = {
      count: async ({
        where,
      }: {
        where: { userId: string; isActive?: boolean };
      }) =>
        linksStore.filter(
          (l) =>
            l.userId === where.userId &&
            (where.isActive === undefined || l.isActive === where.isActive),
        ).length,
      exists: async ({ where }: { where: { shortCode: string } }) =>
        linksStore.some((l) => l.shortCode === where.shortCode),
      create: (partial: Partial<Link>) =>
        ({
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...partial,
        }) as Link,
      save: async (link: Link) => {
        link.updatedAt = new Date();
        const idx = linksStore.findIndex((l) => l.id === link.id);
        if (idx >= 0) {
          linksStore[idx] = link;
        } else {
          linksStore.push(link);
        }
        return link;
      },
      find: async ({ where }: { where: { userId: string } }) =>
        linksStore.filter((l) => l.userId === where.userId),
      findOne: async ({
        where,
      }: {
        where: { id?: string; userId?: string; shortCode?: string };
      }) =>
        linksStore.find(
          (l) =>
            (where.id === undefined || l.id === where.id) &&
            (where.userId === undefined || l.userId === where.userId) &&
            (where.shortCode === undefined || l.shortCode === where.shortCode),
        ) ?? null,
      remove: async (link: Link) => {
        const idx = linksStore.findIndex((l) => l.id === link.id);
        if (idx >= 0) {
          linksStore.splice(idx, 1);
        }
        return link;
      },
    };

    const subscriptionsRepo = {
      findOne: async ({
        where,
      }: {
        where: {
          userId?: string;
          providerCustomerId?: string;
          providerSubscriptionId?: string;
        };
      }) =>
        subscriptionsStore.find(
          (s) =>
            (where.userId === undefined || s.userId === where.userId) &&
            (where.providerCustomerId === undefined ||
              s.providerCustomerId === where.providerCustomerId) &&
            (where.providerSubscriptionId === undefined ||
              s.providerSubscriptionId === where.providerSubscriptionId),
        ) ?? null,
      create: (partial: Partial<Subscription>) =>
        ({
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...partial,
        }) as Subscription,
      save: async (sub: Subscription) => {
        const idx = subscriptionsStore.findIndex((s) => s.userId === sub.userId);
        if (idx >= 0) {
          subscriptionsStore[idx] = {
            ...subscriptionsStore[idx],
            ...sub,
            updatedAt: new Date(),
          };
          return subscriptionsStore[idx];
        }
        subscriptionsStore.push(sub);
        return sub;
      },
    };

    const ordersRepo = {
      findOne: async ({
        where,
      }: {
        where: { id?: string; providerPaymentIntentId?: string };
      }) =>
        ordersStore.find(
          (o) =>
            (where.id === undefined || o.id === where.id) &&
            (where.providerPaymentIntentId === undefined ||
              o.providerPaymentIntentId === where.providerPaymentIntentId),
        ) ?? null,
      find: async ({ where }: { where: { userId: string } }) =>
        ordersStore.filter((o) => o.userId === where.userId),
      create: (partial: Partial<Order>) =>
        ({
          id: randomUUID(),
          currency: 'USD',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...partial,
        }) as Order,
      save: async (order: Order) => {
        const idx = ordersStore.findIndex((o) => o.id === order.id);
        if (idx >= 0) {
          ordersStore[idx] = order;
        } else {
          ordersStore.push(order);
        }
        return order;
      },
      update: async ({ id }: { id: string }, partial: Partial<Order>) => {
        const existing = ordersStore.find((o) => o.id === id);
        if (existing) {
          Object.assign(existing, partial, { updatedAt: new Date() });
        }
      },
    };

    const stripeServiceMock = {
      getStripeInstance: jest.fn(() => ({
        subscriptions: { cancel: jest.fn(async () => ({})) },
        customers: { retrieve: jest.fn(async () => ({})) },
      })),
      getWebhookSecret: jest.fn(() => 'whsec_e2e_test'),
      findOrCreateCustomer: jest.fn(async (email: string, userId: string) => ({
        id: `cus_e2e_${userId.slice(0, 8)}`,
        email,
        metadata: { userId },
      })),
      createSubscriptionCheckoutSession: jest.fn(async () => ({
        id: 'cs_e2e_sub_1',
        url: 'https://checkout.stripe.com/pay/cs_e2e_sub_1',
      })),
      createPortalSession: jest.fn(async () => ({
        id: 'pts_e2e_1',
        url: 'https://billing.stripe.com/p/session/pts_e2e_1',
      })),
      createPaymentCheckoutSession: jest.fn(async () => ({
        id: 'cs_e2e_order_1',
        url: 'https://checkout.stripe.com/pay/cs_e2e_order_1',
      })),
      constructWebhookEvent: jest.fn(),
    };

    const linkEventRepoMock: ILinkEventRepository = {
      getTotalsAndUniqueVisitors: async () => ({
        totalClicks: 1420,
        uniqueVisitors: 985,
      }),
      getDailyTimeline: async () => [
        { date: '2026-10-25', clicks: 140 },
        { date: '2026-10-26', clicks: 210 },
      ],
      getTopOsBreakdown: async () => [
        { name: 'iOS', count: 850 },
        { name: 'Android', count: 470 },
        { name: 'Windows', count: 75 },
      ],
      getTopBrowsersBreakdown: async () => [
        { name: 'Mobile Safari', count: 780 },
        { name: 'Chrome Mobile', count: 450 },
        { name: 'Chrome', count: 120 },
      ],
      getTopCountriesBreakdown: async () => [
        { code: 'HN', count: 1250 },
        { code: 'US', count: 110 },
        { code: 'ES', count: 40 },
      ],
      getTopReferrersBreakdown: async () => [
        { source: 'Direct / QR Scan', count: 1150 },
        { source: 'whatsapp.com', count: 180 },
        { source: 'instagram.com', count: 65 },
      ],
      insertBatch: async () => {},
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => ({
            secret: cfg.get<string>('JWT_SECRET'),
            signOptions: { expiresIn: '1d' },
          }),
        }),
      ],
      controllers: [
        BillingController,
        AuthController,
        LinksController,
        RedirectController,
      ],
      providers: [
        StarterPlanStrategy,
        ProPlanStrategy,
        {
          provide: PLAN_STRATEGIES,
          useFactory: (
            starter: StarterPlanStrategy,
            pro: ProPlanStrategy,
          ) => [starter, pro],
          inject: [StarterPlanStrategy, ProPlanStrategy],
        },
        PlanContextService,
        PlanSeeder,
        { provide: REDIS_CLIENT, useValue: inMemoryRedis },
        CacheService,
        UsersService,
        AuthService,
        JwtAuthGuard,
        LinksService,
        LinkStatsService,
        { provide: StripeService, useValue: stripeServiceMock },
        BillingService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Plan), useValue: plansRepo },
        { provide: getRepositoryToken(Link), useValue: linksRepo },
        {
          provide: getRepositoryToken(Subscription),
          useValue: subscriptionsRepo,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: ordersRepo,
        },
        { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
        { provide: PLAN_REPOSITORY, useClass: TypeOrmPlanRepository },
        { provide: LINK_REPOSITORY, useClass: TypeOrmLinkRepository },
        { provide: LINK_EVENT_REPOSITORY, useValue: linkEventRepoMock },
        {
          provide: SUBSCRIPTION_REPOSITORY,
          useClass: TypeOrmSubscriptionRepository,
        },
        {
          provide: ORDER_REPOSITORY,
          useClass: TypeOrmOrderRepository,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: true }),
      { rawBody: true },
    );
    app.enableCors({
      origin: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin',
        'X-Requested-With',
      ],
      credentials: true,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    setupOpenApi(app);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves OpenAPI 3.0 JSON, YAML, and Swagger UI without colliding with GET /:shortCode', async () => {
    const jsonRes = await app.inject({
      method: 'GET',
      url: '/docs-json',
    });

    expect(jsonRes.statusCode).toBe(200);
    const spec = jsonRes.json();
    expect(spec.openapi).toMatch(/^3\.0\./);
    expect(spec.components.securitySchemes[JWT_BEARER_AUTH]).toBeDefined();
    expect(spec.paths['/auth/register']).toBeDefined();
    expect(spec.paths['/auth/login']).toBeDefined();
    expect(spec.paths['/links']).toBeDefined();
    expect(spec.paths['/links/{id}']).toBeDefined();
    expect(spec.paths['/links/{id}/qr']).toBeDefined();
    expect(spec.paths['/billing/subscription']).toBeDefined();
    expect(spec.paths['/{shortCode}']).toBeDefined();

    const yamlRes = await app.inject({
      method: 'GET',
      url: '/docs-yaml',
    });
    expect(yamlRes.statusCode).toBe(200);
    expect(yamlRes.body).toContain('openapi: 3.0.');

    const uiRes = await app.inject({
      method: 'GET',
      url: '/docs',
    });
    expect([200, 302]).toContain(uiRes.statusCode);
  });

  it('validates Auth DTOs, Sad Paths (400/401/409) and Edge Cases (email normalization & password bounds)', async () => {
    // Sad path: invalid email
    const badEmail = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'StrongPassword123' },
    });
    expect(badEmail.statusCode).toBe(400);

    // Edge case: password < 8 chars
    const shortPwd = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'edge@saas.io', password: '1234567' },
    });
    expect(shortPwd.statusCode).toBe(400);

    // Edge case: password > 72 chars (bcrypt truncation boundary)
    const longPwd = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'edge@saas.io', password: 'A'.repeat(73) },
    });
    expect(longPwd.statusCode).toBe(400);

    // Sad path: forbidNonWhitelisted extra property
    const extraProp = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'edge@saas.io',
        password: 'StrongPassword123',
        plan: 'PRO',
      },
    });
    expect(extraProp.statusCode).toBe(400);

    // Happy path with whitespace + uppercase normalization
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: '  Architect@SaaS.IO  ',
        password: 'SuperSecurePassword123',
      },
    });
    expect(regRes.statusCode).toBe(201);
    expect(regRes.json().user.email).toBe('architect@saas.io');

    // Sad path: duplicate registration (409)
    const dupRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'architect@saas.io',
        password: 'SuperSecurePassword123',
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // Sad path: wrong login password (401)
    const badLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'architect@saas.io',
        password: 'WrongPassword123',
      },
    });
    expect(badLogin.statusCode).toBe(401);
  });

  it('completes full Control Plane + Fast-Path lifecycle including IDOR isolation, QR formats, and cache invalidation', async () => {
    const loginA = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'architect@saas.io',
        password: 'SuperSecurePassword123',
      },
    });
    expect(loginA.statusCode).toBe(200);
    const starterTokenA: string = loginA.json().accessToken;
    const payloadA = await jwtService.verifyAsync<JwtPayload>(starterTokenA);
    expect(payloadA.plan).toBe('STARTER');

    // Sad path on STARTER plan: custom QR colors and customDomain are blocked with 403 Forbidden
    const starterCustomQrRes = await app.inject({
      method: 'POST',
      url: '/links',
      headers: { authorization: `Bearer ${starterTokenA}` },
      payload: {
        targetUrl: 'https://docs.nestjs.com',
        qrConfig: { foregroundColor: '#E0234E' },
      },
    });
    expect(starterCustomQrRes.statusCode).toBe(403);

    const starterCustomDomainRes = await app.inject({
      method: 'POST',
      url: '/links',
      headers: { authorization: `Bearer ${starterTokenA}` },
      payload: {
        targetUrl: 'https://docs.nestjs.com',
        customDomain: 'qr.miempresa.com',
      },
    });
    expect(starterCustomDomainRes.statusCode).toBe(403);

    // Upgrade User A session to PRO plan to test PRO features (custom QR colors, SVG, logo, etc.)
    const tokenA = await jwtService.signAsync({
      sub: payloadA.sub,
      email: payloadA.email,
      plan: 'PRO',
    });

    // Register User B to test multi-tenant isolation (IDOR protection)
    const regB = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'intruder@saas.io',
        password: 'IntruderPassword123',
      },
    });
    const tokenB: string = regB.json().accessToken;

    // Sad paths on POST /links: XSS javascript: URI, invalid hex color, out-of-range margin, reserved shortCode
    for (const invalidPayload of [
      { targetUrl: 'javascript:alert(1)' },
      { targetUrl: 'ftp://files.example.com/archive.zip' },
      {
        targetUrl: 'https://nestjs.com',
        qrConfig: { foregroundColor: '#GGGGGG' },
      },
      { targetUrl: 'https://nestjs.com', qrConfig: { margin: 25 } },
      { targetUrl: 'https://nestjs.com', shortCode: 'docs-json' },
      { targetUrl: 'https://nestjs.com', shortCode: 'ab12' },
    ]) {
      const invalidRes = await app.inject({
        method: 'POST',
        url: '/links',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: invalidPayload,
      });
      expect(invalidRes.statusCode).toBe(400);
    }

    // Happy path: Create link with custom shortCode & QR config
    const createLinkRes = await app.inject({
      method: 'POST',
      url: '/links',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Docs NestJS Rendimiento',
        targetUrl: 'https://docs.nestjs.com/techniques/performance',
        shortCode: 'NestFast',
        qrConfig: {
          foregroundColor: '#E0234E',
          backgroundColor: '#FFFFFF',
          format: 'svg',
          margin: 2,
          width: 256,
          errorCorrectionLevel: 'H',
        },
      },
    });

    expect(createLinkRes.statusCode).toBe(201);
    const createdLink = createLinkRes.json();
    const shortCode: string = createdLink.shortCode;
    const linkId: string = createdLink.id;
    expect(redisKV.get(`r:${shortCode}`)).toBe(
      'https://docs.nestjs.com/techniques/performance',
    );

    // Sad path: Duplicate custom shortCode -> 409 Conflict
    const dupSlugRes = await app.inject({
      method: 'POST',
      url: '/links',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        targetUrl: 'https://other.com',
        shortCode: 'NestFast',
      },
    });
    expect(dupSlugRes.statusCode).toBe(409);

    // Sad path: User B attempts to read/update/delete User A's link -> 404 Not Found
    const idorGet = await app.inject({
      method: 'GET',
      url: `/links/${linkId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(idorGet.statusCode).toBe(404);

    const idorPatch = await app.inject({
      method: 'PATCH',
      url: `/links/${linkId}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { targetUrl: 'https://hijacked.com' },
    });
    expect(idorPatch.statusCode).toBe(404);

    // Sad path: Invalid UUID parameter -> 400 Bad Request
    const badUuidRes = await app.inject({
      method: 'GET',
      url: '/links/not-a-valid-uuid',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(badUuidRes.statusCode).toBe(400);

    // Happy path: List and get own link
    const listRes = await app.inject({
      method: 'GET',
      url: '/links',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    // Happy & Sad paths on Link Statistics (GET /links/:id/stats)
    const statsRes = await app.inject({
      method: 'GET',
      url: `/links/${linkId}/stats?period=7d`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(statsRes.statusCode).toBe(200);
    const statsPayload = statsRes.json();
    expect(statsPayload).toMatchObject({
      linkId,
      period: '7d',
      summary: {
        totalClicks: 1420,
        uniqueVisitors: 985,
        topCountry: 'HN',
        topDevice: 'iOS',
      },
    });
    expect(statsPayload.breakdowns.os).toContainEqual({
      name: 'Others',
      count: 25,
      percentage: 1.76,
    });
    expect(statsPayload.breakdowns.countries).toContainEqual({
      code: 'OT',
      name: 'Others',
      count: 20,
      percentage: 1.4,
    });
    expect(statsPayload.breakdowns.referrers).toContainEqual({
      source: 'others',
      count: 25,
      percentage: 1.75,
    });

    // Sad path on stats: IDOR attempt by User B -> 404 Not Found
    const idorStatsRes = await app.inject({
      method: 'GET',
      url: `/links/${linkId}/stats`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(idorStatsRes.statusCode).toBe(404);

    // Happy & Sad paths on QR rendering (SVG default, PNG override, invalid format 400)
    const svgQrRes = await app.inject({
      method: 'GET',
      url: `/links/${linkId}/qr`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(svgQrRes.statusCode).toBe(200);
    expect(svgQrRes.headers['content-type']).toContain('image/svg+xml');
    expect(svgQrRes.body).toContain('<svg');

    const pngQrRes = await app.inject({
      method: 'GET',
      url: `/links/${linkId}/qr?format=png`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(pngQrRes.statusCode).toBe(200);
    expect(pngQrRes.headers['content-type']).toContain('image/png');
    expect(pngQrRes.rawPayload.subarray(1, 4).toString('ascii')).toBe('PNG');

    const badQrFormatRes = await app.inject({
      method: 'GET',
      url: `/links/${linkId}/qr?format=webp`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(badQrFormatRes.statusCode).toBe(400);

    // Edge case: GET /favicon.ico returns 404 immediately
    const faviconRes = await app.inject({
      method: 'GET',
      url: '/favicon.ico',
    });
    expect(faviconRes.statusCode).toBe(404);

    // Fast-Path Cache Hit redirect with x-forwarded-for + async analytics queue
    const redirectHitRes = await app.inject({
      method: 'GET',
      url: `/${shortCode}`,
      headers: {
        'x-forwarded-for': '203.0.113.55',
        'user-agent': 'FastifyBench/1.0',
        referer: 'https://news.ycombinator.com',
      },
    });
    expect(redirectHitRes.statusCode).toBe(302);
    expect(redirectHitRes.headers.location).toBe(
      'https://docs.nestjs.com/techniques/performance',
    );

    const queuedClicks = redisLists.get(CLICKS_QUEUE_KEY) ?? [];
    expect(queuedClicks.length).toBe(1);
    const clickEvent = JSON.parse(queuedClicks[0]);
    expect(clickEvent.shortCode).toBe(shortCode);
    expect(clickEvent.country).toBe('HN');
    expect(clickEvent.ipAddress).not.toBe('203.0.113.55');

    // Update targetUrl -> reactive DEL r:{shortCode} -> Cache Miss repopulates Redis
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/links/${linkId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Docs Fastify Actualizado',
        targetUrl: 'https://fastify.dev/docs/latest',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().name).toBe('Docs Fastify Actualizado');
    expect(redisKV.has(`r:${shortCode}`)).toBe(false);

    // Cache Miss repopulates Redis
    const redirectMissRes = await app.inject({
      method: 'GET',
      url: `/${shortCode}`,
    });
    expect(redirectMissRes.statusCode).toBe(302);
    expect(redirectMissRes.headers.location).toBe(
      'https://fastify.dev/docs/latest',
    );
    expect(redisKV.get(`r:${shortCode}`)).toBe(
      'https://fastify.dev/docs/latest',
    );

    // Deactivate link -> DEL r:{shortCode} -> 404 on redirect
    await app.inject({
      method: 'PATCH',
      url: `/links/${linkId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { isActive: false },
    });
    const inactiveRedirectRes = await app.inject({
      method: 'GET',
      url: `/${shortCode}`,
    });
    expect(inactiveRedirectRes.statusCode).toBe(404);

    // Billing endpoint: 401 without token, 200 { subscription: null } with token
    const unauthBilling = await app.inject({
      method: 'GET',
      url: '/billing/subscription',
    });
    expect(unauthBilling.statusCode).toBe(401);

    const authBilling = await app.inject({
      method: 'GET',
      url: '/billing/subscription',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(authBilling.statusCode).toBe(200);
    expect(authBilling.json()).toEqual({ subscription: null });

    // Delete link -> 204 -> 404 on redirect
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/links/${linkId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deleteRes.statusCode).toBe(204);

    const deletedRedirectRes = await app.inject({
      method: 'GET',
      url: `/${shortCode}`,
    });
    expect(deletedRedirectRes.statusCode).toBe(404);
  });

  it('correctly handles CORS preflight OPTIONS requests for PATCH and DELETE methods', async () => {
    const testId = randomUUID();

    // Preflight for PATCH /links/:id
    const patchPreflight = await app.inject({
      method: 'OPTIONS',
      url: `/links/${testId}`,
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization, content-type',
      },
    });

    expect(patchPreflight.statusCode).toBe(204);
    expect(patchPreflight.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    const patchAllowedMethods = patchPreflight.headers[
      'access-control-allow-methods'
    ] as string;
    expect(patchAllowedMethods).toContain('PATCH');
    expect(patchAllowedMethods).toContain('DELETE');

    // Preflight for DELETE /links/:id
    const deletePreflight = await app.inject({
      method: 'OPTIONS',
      url: `/links/${testId}`,
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization',
      },
    });

    expect(deletePreflight.statusCode).toBe(204);
    expect(deletePreflight.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    const deleteAllowedMethods = deletePreflight.headers[
      'access-control-allow-methods'
    ] as string;
    expect(deleteAllowedMethods).toContain('DELETE');
  });

  it('completes Billing lifecycle: plan catalog FK seeding, simulate-upgrade JWT rotation, default STRIPE_PRO_PRICE_ID, and boolean physical orders flag', async () => {
    // Verify PlanContextService.onModuleInit() seeded STARTER and PRO in plans table
    expect(plansStore.some((p) => p.id === 'STARTER')).toBe(true);
    expect(plansStore.some((p) => p.id === 'PRO')).toBe(true);

    const regBillingUser = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'billing-e2e@saas.io',
        password: 'BillingPassword123',
      },
    });
    expect(regBillingUser.statusCode).toBe(201);
    const initialToken: string = regBillingUser.json().accessToken;

    // 1. Default STRIPE_PRO_PRICE_ID resolution when priceId is omitted in DTO
    const checkoutRes = await app.inject({
      method: 'POST',
      url: '/billing/checkout/subscription',
      headers: { authorization: `Bearer ${initialToken}` },
      payload: {
        successUrl: 'http://localhost:5173/dashboard?payment=success',
        cancelUrl: 'http://localhost:5173/dashboard?payment=cancelled',
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    expect(checkoutRes.json().checkoutUrl).toContain('checkout.stripe.com');

    // 2. Simulated PRO upgrade in dev mode (verifies FK integrity on users.plan_id='PRO' + JWT rotation)
    const upgradeRes = await app.inject({
      method: 'POST',
      url: '/billing/simulate-upgrade',
      headers: { authorization: `Bearer ${initialToken}` },
    });
    expect(upgradeRes.statusCode).toBe(200);
    const upgradeBody = upgradeRes.json();
    expect(upgradeBody.plan).toBe('PRO');
    expect(upgradeBody.accessToken).toBeDefined();

    // Even using the OLD starter JWT, LinksService resolves effective plan='PRO' from UsersService!
    const customQrWithStaleToken = await app.inject({
      method: 'POST',
      url: '/links',
      headers: { authorization: `Bearer ${initialToken}` },
      payload: {
        name: 'QR Corporativo PRO',
        targetUrl: 'https://empresa.hn/menu',
        qrConfig: { foregroundColor: '#1E293B' },
      },
    });
    expect(customQrWithStaleToken.statusCode).toBe(201);
    const proLinkId: string = customQrWithStaleToken.json().id;

    // 3. Boolean Feature Flag toggle for physical orders
    const cfgRes = await app.inject({
      method: 'GET',
      url: '/billing/config',
      headers: { authorization: `Bearer ${upgradeBody.accessToken}` },
    });
    expect(cfgRes.statusCode).toBe(200);
    expect(cfgRes.json().physicalOrdersEnabled).toBe(true);

    // Disable physical orders dynamically
    const disableFlagRes = await app.inject({
      method: 'PATCH',
      url: '/billing/config/physical-orders',
      headers: { authorization: `Bearer ${upgradeBody.accessToken}` },
      payload: { enabled: false },
    });
    expect(disableFlagRes.statusCode).toBe(200);
    expect(disableFlagRes.json().physicalOrdersEnabled).toBe(false);

    const blockedOrderRes = await app.inject({
      method: 'POST',
      url: '/billing/orders/direct',
      headers: { authorization: `Bearer ${upgradeBody.accessToken}` },
      payload: {
        items: [{ linkId: proLinkId, itemType: 'plastic_card', quantity: 2 }],
        shippingAddress: {
          fullName: 'Kevin Dev',
          addressLine1: 'Blvd Morazan',
          city: 'Tegucigalpa',
          phone: '+50499998888',
        },
      },
    });
    expect(blockedOrderRes.statusCode).toBe(403);

    // Re-enable physical orders dynamically via boolean flag
    const enableFlagRes = await app.inject({
      method: 'PATCH',
      url: '/billing/config/physical-orders',
      headers: { authorization: `Bearer ${upgradeBody.accessToken}` },
      payload: { enabled: true },
    });
    expect(enableFlagRes.statusCode).toBe(200);
    expect(enableFlagRes.json().physicalOrdersEnabled).toBe(true);

    const directOrderRes = await app.inject({
      method: 'POST',
      url: '/billing/orders/direct',
      headers: { authorization: `Bearer ${upgradeBody.accessToken}` },
      payload: {
        items: [{ linkId: proLinkId, itemType: 'plastic_card', quantity: 2 }],
        shippingAddress: {
          fullName: 'Kevin Dev',
          addressLine1: 'Blvd Morazan',
          city: 'Tegucigalpa',
          phone: '+50499998888',
        },
      },
    });
    expect(directOrderRes.statusCode).toBe(201);
    expect(directOrderRes.json().paymentStatus).toBe('paid');

    // 4. Cancel subscription back to STARTER
    const cancelRes = await app.inject({
      method: 'POST',
      url: '/billing/cancel',
      headers: { authorization: `Bearer ${upgradeBody.accessToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().plan).toBe('STARTER');
    expect(cancelRes.json().accessToken).toBeDefined();
  });
});
