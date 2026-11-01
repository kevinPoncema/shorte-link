import { ForbiddenException } from '@nestjs/common';
import { BasePlanStrategy, PlanConfig } from './base-plan.strategy';

class TestPlanStrategy extends BasePlanStrategy {
  constructor(config: PlanConfig) {
    super(config);
  }
}

describe('BasePlanStrategy', () => {
  const baseConfig: PlanConfig = {
    tierName: 'CUSTOM_TIER',
    displayName: 'Plan Personalizado',
    monetizationModel: 'Usage Based',
    maxActiveLinks: 10,
    analyticsRetentionDays: 30,
    canCustomizeQrDesign: true,
    canUseCustomDomain: false,
    upgradeMessage: 'Contacte a soporte para aumentar su límite.',
  };

  let strategy: TestPlanStrategy;

  beforeEach(() => {
    strategy = new TestPlanStrategy(baseConfig);
  });

  it('initializes properties directly from configuration without hardcoded values', () => {
    expect(strategy.tierName).toBe('CUSTOM_TIER');
    expect(strategy.displayName).toBe('Plan Personalizado');
    expect(strategy.monetizationModel).toBe('Usage Based');
    expect(strategy.getMaxActiveLinks()).toBe(10);
    expect(strategy.getAnalyticsRetentionDays()).toBe(30);
    expect(strategy.canCustomizeQrDesign()).toBe(true);
    expect(strategy.canUseCustomDomain()).toBe(false);
  });

  it('allows creating links when below quota', () => {
    expect(() => strategy.assertCanCreateLink(0)).not.toThrow();
    expect(() => strategy.assertCanCreateLink(9)).not.toThrow();
  });

  it('throws ForbiddenException with upgrade message when quota is reached or exceeded', () => {
    expect(() => strategy.assertCanCreateLink(10)).toThrow(ForbiddenException);
    expect(() => strategy.assertCanCreateLink(10)).toThrow(
      'Maximum links quota (10) reached for plan CUSTOM_TIER. Contacte a soporte para aumentar su límite.',
    );
    expect(() => strategy.assertCanCreateLink(15)).toThrow(ForbiddenException);
  });

  it('formats error cleanly when upgradeMessage is not specified', () => {
    const noHintStrategy = new TestPlanStrategy({
      ...baseConfig,
      upgradeMessage: undefined,
    });

    expect(() => noHintStrategy.assertCanCreateLink(10)).toThrow(
      'Maximum links quota (10) reached for plan CUSTOM_TIER.',
    );
  });
});
