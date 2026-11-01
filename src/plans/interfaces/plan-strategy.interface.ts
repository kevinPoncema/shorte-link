/** Token de inyección para registrar estrategias adicionales en `PlanContextService`. */
export const PLAN_STRATEGIES = Symbol('PLAN_STRATEGIES');

export interface PlanStrategy {
  readonly tierName: string;

  /**
   * Valida si el usuario puede crear un nuevo enlace dado su conteo total actual.
   * Debe lanzar una excepción HTTP (ej. `ForbiddenException`) si se excede la cuota.
   */
  assertCanCreateLink(currentCount: number): void;

  canCustomizeQrDesign(): boolean;

  getMaxActiveLinks(): number;

  getAnalyticsRetentionDays(): number;
}
