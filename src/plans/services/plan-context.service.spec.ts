import { ForbiddenException } from '@nestjs/common';
import { PlanStrategy } from '../interfaces/plan-strategy.interface';
import { DefaultPlanStrategy } from '../strategies/default-plan.strategy';
import { PlanContextService } from './plan-context.service';

class MockFreePlanStrategy implements PlanStrategy {
  readonly tierName = 'FREE';

  assertCanCreateLink(currentCount: number): void {
    if (currentCount >= 5) {
      throw new ForbiddenException('Free tier limit reached');
    }
  }

  canCustomizeQrDesign(): boolean {
    return false;
  }

  getMaxActiveLinks(): number {
    return 5;
  }

  getAnalyticsRetentionDays(): number {
    return 7;
  }
}

describe('PlanContextService & DefaultPlanStrategy', () => {
  let defaultStrategy: DefaultPlanStrategy;
  let freeStrategy: MockFreePlanStrategy;
  let planContextService: PlanContextService;

  beforeEach(() => {
    defaultStrategy = new DefaultPlanStrategy();
    freeStrategy = new MockFreePlanStrategy();
    planContextService = new PlanContextService(defaultStrategy, [
      freeStrategy,
    ]);
  });

  describe('DefaultPlanStrategy (Happy Path & Boundary Values)', () => {
    it('exposes unrestricted capabilities for development and default accounts', () => {
      expect(defaultStrategy.tierName).toBe('DEFAULT');
      expect(() => defaultStrategy.assertCanCreateLink(0)).not.toThrow();
      expect(() => defaultStrategy.assertCanCreateLink(1_000_000)).not.toThrow();
      expect(defaultStrategy.canCustomizeQrDesign()).toBe(true);
      expect(defaultStrategy.getMaxActiveLinks()).toBe(Infinity);
      expect(defaultStrategy.getAnalyticsRetentionDays()).toBe(365);
    });
  });

  describe('PlanContextService (Happy, Sad & Edge Cases)', () => {
    it('initializes cleanly even when optional registeredStrategies array is omitted', () => {
      const standaloneContext = new PlanContextService(defaultStrategy);
      expect(standaloneContext.getStrategy('DEFAULT')).toBe(defaultStrategy);
      expect(standaloneContext.getStrategy()).toBe(defaultStrategy);
    });

    it('falls back to DefaultPlanStrategy when planKey is undefined, null, empty, whitespace, or unknown', () => {
      expect(planContextService.getStrategy(undefined)).toBe(defaultStrategy);
      expect(planContextService.getStrategy(null)).toBe(defaultStrategy);
      expect(planContextService.getStrategy('')).toBe(defaultStrategy);
      expect(planContextService.getStrategy('   ')).toBe(defaultStrategy);
      expect(planContextService.getStrategy('NON_EXISTENT')).toBe(
        defaultStrategy,
      );
    });

    it('resolves strategies case-insensitively (exact and lowercase keys)', () => {
      expect(planContextService.getStrategy('DEFAULT')).toBe(defaultStrategy);
      expect(planContextService.getStrategy('default')).toBe(defaultStrategy);
      expect(planContextService.getStrategy('FREE')).toBe(freeStrategy);
      expect(planContextService.getStrategy('free')).toBe(freeStrategy);
    });

    it('enforces quota and customization rules on custom registered strategies', () => {
      const resolved = planContextService.getStrategy('FREE');
      expect(resolved.canCustomizeQrDesign()).toBe(false);
      expect(resolved.getMaxActiveLinks()).toBe(5);
      expect(resolved.getAnalyticsRetentionDays()).toBe(7);
      expect(() => resolved.assertCanCreateLink(4)).not.toThrow();
      expect(() => resolved.assertCanCreateLink(5)).toThrow(ForbiddenException);
    });
  });
});
