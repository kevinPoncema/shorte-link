import { ForbiddenException } from '@nestjs/common';
import {
  PRO_ANALYTICS_RETENTION_DAYS,
  PRO_MAX_ACTIVE_LINKS,
  ProPlanStrategy,
} from '../strategies/pro-plan.strategy';
import {
  STARTER_ANALYTICS_RETENTION_DAYS,
  STARTER_MAX_ACTIVE_LINKS,
  StarterPlanStrategy,
} from '../strategies/starter-plan.strategy';
import { PlanContextService } from './plan-context.service';

describe('PlanContextService, StarterPlanStrategy & ProPlanStrategy', () => {
  let starterStrategy: StarterPlanStrategy;
  let proStrategy: ProPlanStrategy;
  let planContextService: PlanContextService;

  beforeEach(() => {
    starterStrategy = new StarterPlanStrategy();
    proStrategy = new ProPlanStrategy();
    planContextService = new PlanContextService(starterStrategy, proStrategy, [
      starterStrategy,
      proStrategy,
    ]);
  });

  describe('StarterPlanStrategy (Gratuito / Físico - Default)', () => {
    it('enforces max 3 active links, 7 days retention, standard B&W QR, and no custom domain', () => {
      expect(starterStrategy.tierName).toBe('STARTER');
      expect(starterStrategy.displayName).toContain('Plan Starter');
      expect(starterStrategy.getMaxActiveLinks()).toBe(
        STARTER_MAX_ACTIVE_LINKS,
      );
      expect(starterStrategy.getMaxActiveLinks()).toBe(3);
      expect(starterStrategy.getAnalyticsRetentionDays()).toBe(
        STARTER_ANALYTICS_RETENTION_DAYS,
      );
      expect(starterStrategy.getAnalyticsRetentionDays()).toBe(7);
      expect(starterStrategy.canCustomizeQrDesign()).toBe(false);
      expect(starterStrategy.canUseCustomDomain()).toBe(false);

      // Happy path: 0, 1, 2 links allowed
      expect(() => starterStrategy.assertCanCreateLink(0)).not.toThrow();
      expect(() => starterStrategy.assertCanCreateLink(2)).not.toThrow();

      // Sad path / Boundary: 3 or more links throws ForbiddenException
      expect(() => starterStrategy.assertCanCreateLink(3)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('ProPlanStrategy (Pro / Premium $9 - $15/mes)', () => {
    it('enforces max 50 active links, 365 days retention, custom brand QR + logo, and CNAME custom domain', () => {
      expect(proStrategy.tierName).toBe('PRO');
      expect(proStrategy.displayName).toContain('Plan Pro');
      expect(proStrategy.getMaxActiveLinks()).toBe(PRO_MAX_ACTIVE_LINKS);
      expect(proStrategy.getMaxActiveLinks()).toBe(50);
      expect(proStrategy.getAnalyticsRetentionDays()).toBe(
        PRO_ANALYTICS_RETENTION_DAYS,
      );
      expect(proStrategy.getAnalyticsRetentionDays()).toBe(365);
      expect(proStrategy.canCustomizeQrDesign()).toBe(true);
      expect(proStrategy.canUseCustomDomain()).toBe(true);

      // Happy path: 0 to 49 links allowed
      expect(() => proStrategy.assertCanCreateLink(0)).not.toThrow();
      expect(() => proStrategy.assertCanCreateLink(49)).not.toThrow();

      // Sad path / Boundary: 50 or more links throws ForbiddenException
      expect(() => proStrategy.assertCanCreateLink(50)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('PlanContextService (Happy, Sad & Edge Cases)', () => {
    it('initializes cleanly even when optional arguments are omitted', () => {
      const standaloneContext = new PlanContextService(starterStrategy);
      expect(standaloneContext.getStrategy('STARTER')).toBe(starterStrategy);
      expect(standaloneContext.getStrategy('PRO').tierName).toBe('PRO');
      expect(standaloneContext.getStrategy()).toBe(starterStrategy);
    });

    it('falls back to StarterPlanStrategy when planKey is undefined, null, empty, whitespace, or unknown', () => {
      expect(planContextService.getStrategy(undefined)).toBe(starterStrategy);
      expect(planContextService.getStrategy(null)).toBe(starterStrategy);
      expect(planContextService.getStrategy('')).toBe(starterStrategy);
      expect(planContextService.getStrategy('   ')).toBe(starterStrategy);
      expect(planContextService.getStrategy('NON_EXISTENT')).toBe(
        starterStrategy,
      );
    });

    it('resolves STARTER (and aliases DEFAULT/FREE) and PRO (and alias PREMIUM) case-insensitively', () => {
      expect(planContextService.getStrategy('STARTER')).toBe(starterStrategy);
      expect(planContextService.getStrategy('starter')).toBe(starterStrategy);
      expect(planContextService.getStrategy('DEFAULT')).toBe(starterStrategy);
      expect(planContextService.getStrategy('FREE')).toBe(starterStrategy);

      expect(planContextService.getStrategy('PRO')).toBe(proStrategy);
      expect(planContextService.getStrategy('pro')).toBe(proStrategy);
      expect(planContextService.getStrategy('PREMIUM')).toBe(proStrategy);
    });
  });
});
