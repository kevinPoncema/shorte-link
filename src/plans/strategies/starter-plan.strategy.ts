import { Injectable } from '@nestjs/common';
import { BasePlanStrategy, PlanConfig } from './base-plan.strategy';

export const STARTER_MAX_ACTIVE_LINKS = 3;
export const STARTER_ANALYTICS_RETENTION_DAYS = 7;

/**
 * Configuración canónica para el Plan Starter (Gratuito / Físico).
 */
export const STARTER_PLAN_CONFIG: PlanConfig = Object.freeze({
  tierName: 'STARTER',
  displayName: 'Plan Starter',
  monetizationModel: 'Free',
  maxActiveLinks: STARTER_MAX_ACTIVE_LINKS,
  analyticsRetentionDays: STARTER_ANALYTICS_RETENTION_DAYS,
  canCustomizeQrDesign: false,
  canUseCustomDomain: false,
  upgradeMessage: 'Upgrade to PRO for up to 50 active links.',
});

/**
 * Estrategia para el **Plan Starter (Gratuito)**.
 * - Límite de enlaces dinámicos: Hasta 3 enlaces activos.
 * - Retención de analíticas: 7 días.
 * - Personalización del QR: No (renderizado estándar en blanco y negro).
 * - Dominio personalizado: No (utiliza el dominio base del servicio).
 */
@Injectable()
export class StarterPlanStrategy extends BasePlanStrategy {
  constructor(config: PlanConfig = STARTER_PLAN_CONFIG) {
    super(config);
  }
}
