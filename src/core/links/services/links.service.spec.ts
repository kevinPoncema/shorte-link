import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PlanStrategy } from '../../../plans/interfaces/plan-strategy.interface';
import { PlanContextService } from '../../../plans/services/plan-context.service';
import { DefaultPlanStrategy } from '../../../plans/strategies/default-plan.strategy';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CacheService } from '../../cache/cache.service';
import { Link } from '../../models/link.entity';
import { LinksController } from '../controllers/links.controller';
import { RedirectController } from '../controllers/redirect.controller';
import { ILinkRepository } from '../interfaces/link-repository.interface';
import { TypeOrmLinkRepository } from '../repositories/typeorm-link.repository';
import { LinksService } from './links.service';

describe('LinksService, TypeOrmLinkRepository, LinksController & RedirectController', () => {
  let linksService: LinksService;
  let linkRepository: ILinkRepository;
  let linksController: LinksController;
  let redirectController: RedirectController;
  let planContextService: PlanContextService;
  let cacheServiceMock: jest.Mocked<
    Pick<
      CacheService,
      | 'getRedirectTarget'
      | 'setRedirectTarget'
      | 'invalidateRedirectTarget'
      | 'enqueueClickEvent'
    >
  >;
  let storedLinks: Link[];
  let linksRepoMock: {
    count: jest.Mock;
    exists: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };

  const defaultUser: JwtPayload = {
    sub: '22222222-2222-4222-8222-222222222222',
    email: 'dev@empresa.com',
    plan: 'PRO',
  };

  const starterUser: JwtPayload = {
    sub: '33333333-3333-4333-8333-333333333333',
    email: 'starter@empresa.com',
    plan: 'STARTER',
  };

  const otherUser: JwtPayload = {
    sub: '99999999-9999-4999-8999-999999999999',
    email: 'other@empresa.com',
    plan: 'PRO',
  };

  beforeEach(() => {
    storedLinks = [];

    linksRepoMock = {
      count: jest.fn(
        async ({ where }: { where: { userId: string; isActive?: boolean } }) =>
          storedLinks.filter(
            (l) =>
              l.userId === where.userId &&
              (where.isActive === undefined || l.isActive === where.isActive),
          ).length,
      ),
      exists: jest.fn(async ({ where }: { where: { shortCode: string } }) =>
        storedLinks.some((l) => l.shortCode === where.shortCode),
      ),
      create: jest.fn((partial: Partial<Link>) => ({
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
      })),
      save: jest.fn(async (link: Link) => {
        const idx = storedLinks.findIndex((l) => l.id === link.id);
        if (idx >= 0) {
          storedLinks[idx] = link;
        } else {
          storedLinks.push(link);
        }
        return link;
      }),
      find: jest.fn(async ({ where }: { where: { userId: string } }) =>
        storedLinks.filter((l) => l.userId === where.userId),
      ),
      findOne: jest.fn(
        async ({
          where,
        }: {
          where: { id?: string; userId?: string; shortCode?: string };
        }) =>
          storedLinks.find(
            (l) =>
              (where.id === undefined || l.id === where.id) &&
              (where.userId === undefined || l.userId === where.userId) &&
              (where.shortCode === undefined ||
                l.shortCode === where.shortCode),
          ) ?? null,
      ),
      remove: jest.fn(async (link: Link) => {
        storedLinks = storedLinks.filter((l) => l.id !== link.id);
        return link;
      }),
    };

    cacheServiceMock = {
      getRedirectTarget: jest.fn().mockResolvedValue(null),
      setRedirectTarget: jest.fn().mockResolvedValue(undefined),
      invalidateRedirectTarget: jest.fn().mockResolvedValue(undefined),
      enqueueClickEvent: jest.fn().mockResolvedValue(undefined),
    };

    planContextService = new PlanContextService(new DefaultPlanStrategy());

    const configService = new ConfigService({
      APP_BASE_URL: 'https://qr.test/',
      IP_HASH_SALT: 'test-salt',
    });

    linkRepository = new TypeOrmLinkRepository(linksRepoMock as never);

    linksService = new LinksService(
      linkRepository,
      planContextService,
      cacheServiceMock as unknown as CacheService,
      configService,
    );

    linksController = new LinksController(linksService);
    redirectController = new RedirectController(linksService);
  });

  describe('createLink (Happy, Sad & Edge Cases)', () => {
    it('creates links with auto-generated or custom shortCode and prewarms Redis', async () => {
      const autoLink = await linksController.create(defaultUser, {
        name: 'Promo Primavera',
        targetUrl: 'https://nestjs.com',
        qrConfig: { foregroundColor: '#112233', format: 'svg' },
      });

      expect(autoLink.shortCode).toMatch(/^[A-Za-z0-9]{7}$/);
      expect(autoLink.name).toBe('Promo Primavera');
      expect(cacheServiceMock.setRedirectTarget).toHaveBeenCalledWith(
        autoLink.shortCode,
        'https://nestjs.com',
      );

      const customLink = await linksController.create(defaultUser, {
        targetUrl: 'https://fastify.dev',
        shortCode: 'Fastify7',
      });
      expect(customLink.shortCode).toBe('Fastify7');

      const allUserLinks = await linksController.findAll(defaultUser);
      expect(allUserLinks).toHaveLength(2);
    });

    it('rejects reserved shortCodes (including OpenAPI docs routes) and duplicate custom shortCodes', async () => {
      for (const reserved of ['auth', 'LINKS', 'docs', 'docs-json', 'swagger']) {
        await expect(
          linksService.createLink(defaultUser, {
            targetUrl: 'https://example.com',
            shortCode: reserved,
          }),
        ).rejects.toThrow(BadRequestException);
      }

      await linksService.createLink(defaultUser, {
        targetUrl: 'https://example.com',
        shortCode: 'Unique01',
      });

      await expect(
        linksService.createLink(otherUser, {
          targetUrl: 'https://example.org',
          shortCode: 'Unique01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('retries on random shortCode collision and throws InternalServerErrorException after 5 consecutive collisions', async () => {
      linksRepoMock.exists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const retried = await linksService.createLink(defaultUser, {
        targetUrl: 'https://retry-success.com',
      });
      expect(retried.shortCode).toHaveLength(7);

      linksRepoMock.exists.mockResolvedValue(true);
      await expect(
        linksService.createLink(defaultUser, {
          targetUrl: 'https://exhausted.com',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('enforces STARTER (max 3 active links, B&W QR, no custom domain) vs PRO rules and custom strategies', async () => {
      // STARTER sad path: custom QR color or logoUrl blocked
      await expect(
        linksService.createLink(starterUser, {
          targetUrl: 'https://starter.com',
          qrConfig: { foregroundColor: '#FF0000' },
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        linksService.createLink(starterUser, {
          targetUrl: 'https://starter.com',
          qrConfig: { logoUrl: 'https://cdn.empresa.com/logo.svg' },
        }),
      ).rejects.toThrow(ForbiddenException);

      // STARTER sad path: custom CNAME domain blocked
      await expect(
        linksService.createLink(starterUser, {
          targetUrl: 'https://starter.com',
          customDomain: 'qr.starter.com',
        }),
      ).rejects.toThrow(ForbiddenException);

      // STARTER happy path: up to 3 active links with standard B&W (#000000 / #FFFFFF) or empty qrConfig
      const s1 = await linksService.createLink(starterUser, {
        targetUrl: 'https://starter-1.com',
        qrConfig: { foregroundColor: '#000000', backgroundColor: '#FFFFFF' },
      });
      await linksService.createLink(starterUser, {
        targetUrl: 'https://starter-2.com',
        qrConfig: {},
      });
      await linksService.createLink(starterUser, {
        targetUrl: 'https://starter-3.com',
      });

      // STARTER sad path: 4th link exceeds Starter max 3 quota
      await expect(
        linksService.createLink(starterUser, {
          targetUrl: 'https://starter-4.com',
        }),
      ).rejects.toThrow(ForbiddenException);

      // STARTER sad path on update: custom domain or non-standard QR color blocked
      await expect(
        linksService.updateLink(starterUser, s1.id, {
          customDomain: 'qr.starter.com',
        }),
      ).rejects.toThrow(ForbiddenException);

      // PRO happy path: custom brand colors, logoUrl, and customDomain allowed
      const proLink = await linksService.createLink(defaultUser, {
        targetUrl: 'https://pro-brand.com',
        customDomain: 'qr.probrand.com',
        qrConfig: {
          foregroundColor: '#1E293B',
          backgroundColor: '#F8FAFC',
          logoUrl: 'https://cdn.probrand.com/logo.svg',
        },
      });
      expect(proLink.qrConfig.logoUrl).toBe(
        'https://cdn.probrand.com/logo.svg',
      );

      const strictStrategy: PlanStrategy = {
        tierName: 'STRICT',
        displayName: 'Strict Custom Tier',
        monetizationModel: 'Custom',
        assertCanCreateLink(currentCount: number) {
          if (currentCount >= 3) {
            throw new ForbiddenException('Total quota exceeded');
          }
        },
        canCustomizeQrDesign: () => false,
        canUseCustomDomain: () => false,
        getMaxActiveLinks: () => 1,
        getAnalyticsRetentionDays: () => 14,
      };
      planContextService.registerStrategy(strictStrategy);
      const strictUser: JwtPayload = {
        sub: '44444444-4444-4444-8444-444444444444',
        email: 'strict@empresa.com',
        plan: 'STRICT',
      };

      // Edge case: empty qrConfig {} is NOT treated as custom design
      const first = await linksService.createLink(strictUser, {
        targetUrl: 'https://example.com',
        qrConfig: {},
      });
      expect(first.isActive).toBe(true);

      // Sad path: maxActiveLinks (1) reached even though total quota (3) is not yet reached
      await expect(
        linksService.createLink(strictUser, {
          targetUrl: 'https://second-active.com',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Deactivating first link frees active slot so second link can be created
      await linksService.updateLink(strictUser, first.id, { isActive: false });
      const second = await linksService.createLink(strictUser, {
        targetUrl: 'https://second-active.com',
      });
      expect(second.isActive).toBe(true);

      // Sad path: re-activating first link while second is active hits maxActiveLinks (1)
      await expect(
        linksService.updateLink(strictUser, first.id, { isActive: true }),
      ).rejects.toThrow(ForbiddenException);

      // Edge case: updating an ALREADY active link with isActive: true succeeds
      await expect(
        linksService.updateLink(strictUser, second.id, {
          isActive: true,
          targetUrl: 'https://second-updated.com',
        }),
      ).resolves.toMatchObject({ targetUrl: 'https://second-updated.com' });

      // Sad path: updating qrConfig with custom margin on STRICT plan throws ForbiddenException
      await expect(
        linksService.updateLink(strictUser, second.id, {
          qrConfig: { margin: 4 },
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Ownership isolation, updateLink & deleteLink (Sad & Edge Cases)', () => {
    it('prevents cross-user access (IDOR) across findOne, update, delete, and QR generation', async () => {
      const ownerLink = await linksService.createLink(defaultUser, {
        targetUrl: 'https://private-owner.com',
      });
      cacheServiceMock.invalidateRedirectTarget.mockClear();

      await expect(
        linksController.findOne(otherUser, ownerLink.id),
      ).rejects.toThrow(NotFoundException);

      await expect(
        linksController.update(otherUser, ownerLink.id, {
          targetUrl: 'https://attacker.com',
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        linksController.remove(otherUser, ownerLink.id),
      ).rejects.toThrow(NotFoundException);

      await expect(
        linksService.generateQrCode(otherUser.sub, ownerLink.id),
      ).rejects.toThrow(NotFoundException);

      // Cache must NOT have been invalidated by unauthorized attempts
      expect(cacheServiceMock.invalidateRedirectTarget).not.toHaveBeenCalled();
    });

    it('executes mandatory reactive DEL r:{shortCode} on valid update and delete', async () => {
      const link = await linksService.createLink(defaultUser, {
        targetUrl: 'https://v1.com',
      });

      await linksController.update(defaultUser, link.id, {
        targetUrl: 'https://v2.com',
        qrConfig: { width: 512 },
      });
      expect(cacheServiceMock.invalidateRedirectTarget).toHaveBeenCalledWith(
        link.shortCode,
      );

      cacheServiceMock.invalidateRedirectTarget.mockClear();
      await linksController.remove(defaultUser, link.id);
      expect(cacheServiceMock.invalidateRedirectTarget).toHaveBeenCalledWith(
        link.shortCode,
      );
    });
  });

  describe('QR generation & LinksController.getQrCode (Happy, Sad & Edge Cases)', () => {
    it('renders PNG by default, SVG when configured or overridden, and rejects unsupported formats', async () => {
      const link = await linksService.createLink(defaultUser, {
        targetUrl: 'https://nestjs.com',
      });

      const replyMock = {
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      // Default PNG when format query is undefined
      await linksController.getQrCode(
        defaultUser,
        link.id,
        undefined,
        replyMock as never,
      );
      expect(replyMock.header).toHaveBeenCalledWith(
        'Content-Type',
        'image/png',
      );

      // Query override to SVG
      await linksController.getQrCode(
        defaultUser,
        link.id,
        'svg',
        replyMock as never,
      );
      expect(replyMock.header).toHaveBeenCalledWith(
        'Content-Type',
        'image/svg+xml',
      );

      // Sad path: unsupported format
      await expect(
        linksController.getQrCode(
          defaultUser,
          link.id,
          'gif',
          replyMock as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Fast-Path RedirectController & async click queue (Happy, Sad & Edge Cases)', () => {
    it('resolves Cache Miss from PostgreSQL, populates Redis, and throws 404 for inactive or missing shortCodes', async () => {
      const activeLink = await linksService.createLink(defaultUser, {
        targetUrl: 'https://cache-miss-origin.com',
      });
      cacheServiceMock.setRedirectTarget.mockClear();
      cacheServiceMock.getRedirectTarget.mockResolvedValue(null);

      const replyMock = {
        code: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      await redirectController.redirect(
        activeLink.shortCode,
        {
          ip: '198.51.100.77',
          headers: {
            'user-agent': 'SingleStringAgent/1.0',
            referer: 'https://single-referer.test',
          },
        } as never,
        replyMock as never,
      );

      expect(cacheServiceMock.setRedirectTarget).toHaveBeenCalledWith(
        activeLink.shortCode,
        'https://cache-miss-origin.com',
      );
      expect(replyMock.code).toHaveBeenCalledWith(302);

      // Inactive link on Cache Miss -> 404
      await linksService.updateLink(defaultUser, activeLink.id, {
        isActive: false,
      });
      cacheServiceMock.getRedirectTarget.mockResolvedValue(null);
      await expect(
        linksService.resolveShortCodeForRedirect(activeLink.shortCode),
      ).rejects.toThrow(NotFoundException);

      // Missing link on Cache Miss -> 404
      await expect(
        linksService.resolveShortCodeForRedirect('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('immediately throws 404 for favicon.ico without hitting Redis or PostgreSQL', async () => {
      await expect(
        redirectController.redirect(
          'favicon.ico',
          { headers: {} } as never,
          {} as never,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(cacheServiceMock.getRedirectTarget).not.toHaveBeenCalled();
      expect(linksRepoMock.findOne).not.toHaveBeenCalled();
    });

    it('handles array headers, missing IP fallback, and survives async queue failures without breaking 302 redirect', async () => {
      cacheServiceMock.getRedirectTarget.mockResolvedValueOnce(
        'https://resilient-target.com',
      );
      cacheServiceMock.enqueueClickEvent.mockRejectedValueOnce(
        new Error('Redis queue temporarily full'),
      );

      const replyMock = {
        code: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      await redirectController.redirect(
        'hit9999',
        {
          ip: undefined,
          headers: {
            'user-agent': ['AgentOne/1.0', 'AgentTwo/2.0'],
            referrer: ['https://ref1.test', 'https://ref2.test'],
          },
        } as never,
        replyMock as never,
      );

      expect(replyMock.code).toHaveBeenCalledWith(302);
      expect(replyMock.header).toHaveBeenCalledWith(
        'Location',
        'https://resilient-target.com',
      );
      expect(replyMock.send).toHaveBeenCalled();

      // Let microtask queue settle to confirm rejected LPUSH was caught cleanly
      await new Promise((resolve) => setImmediate(resolve));
      expect(cacheServiceMock.enqueueClickEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          shortCode: 'hit9999',
          userAgent: 'AgentOne/1.0',
          referer: 'https://ref1.test',
        }),
      );
    });
  });
});
