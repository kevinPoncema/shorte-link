/** Token de inyección para registrar el catálogo de estrategias en `PlanContextService`. */
export const PLAN_STRATEGIES = Symbol('PLAN_STRATEGIES');

/**
 * Contrato del patrón **Strategy** para determinar reglas de negocio, cuotas y capacidades
 * según el nivel de suscripción del usuario (`STARTER` vs `PRO`).
 *
 * Cumple con los principios **SOLID** (Open/Closed Principle y Single Responsibility Principle).
 */
export interface PlanStrategy {
  /** Identificador canónico del plan (ej. `'STARTER'`, `'PRO'`). */
  readonly tierName: string;

  /** Nombre descriptivo comercial del plan. */
  readonly displayName: string;

  /** Enfoque de monetización del nivel de suscripción. */
  readonly monetizationModel: string;

  /**
   * Valida si el usuario puede crear un nuevo enlace dado su conteo actual.
   * Lanza `ForbiddenException` si se excede la cuota del plan.
   */
  assertCanCreateLink(currentCount: number): void;

  /**
   * Indica si el plan permite personalizar el diseño del QR
   * (colores hexadecimales de marca y logo SVG/PNG al centro).
   */
  canCustomizeQrDesign(): boolean;

  /**
   * Indica si el plan permite configurar un dominio personalizado (subdominio CNAME propio).
   */
  canUseCustomDomain(): boolean;

  /**
   * Retorna el límite máximo de enlaces dinámicos activos permitidos simultáneamente.
   */
  getMaxActiveLinks(): number;

  /**
   * Retorna los días de retención de analíticas antes de la purga automática.
   */
  getAnalyticsRetentionDays(): number;
}
