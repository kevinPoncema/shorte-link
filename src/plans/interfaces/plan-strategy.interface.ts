export const PLAN_STRATEGIES = Symbol('PLAN_STRATEGIES');

export interface PlanStrategy {
  readonly tierName: string;
  readonly displayName: string;
  readonly monetizationModel: string;
  assertCanCreateLink(currentCount: number): void;
  canCustomizeQrDesign(): boolean;
  canUseCustomDomain(): boolean;
  getMaxActiveLinks(): number;
  getAnalyticsRetentionDays(): number;
}
