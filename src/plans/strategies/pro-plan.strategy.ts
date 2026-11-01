import { Injectable, Optional } from '@nestjs/common';
import { BasePlanStrategy, PlanConfig } from './base-plan.strategy';

export const PRO_MAX_ACTIVE_LINKS = 50;
export const PRO_ANALYTICS_RETENTION_DAYS = 365;

/**
 * Configuración canónica para el Plan Pro / Premium.
 */
export const PRO_PLAN_CONFIG: PlanConfig = Object.freeze({
  tierName: 'PRO',
  displayName: 'Plan Pro / Premium ($9 - $15/mes)',
  monetizationModel:
    'Suscripción recurrente para negocios en crecimiento o múltiples sucursales',
  maxActiveLinks: PRO_MAX_ACTIVE_LINKS,
  analyticsRetentionDays: PRO_ANALYTICS_RETENTION_DAYS,
  canCustomizeQrDesign: true,
  canUseCustomDomain: true,
});

/**
 * Estrategia para el **Plan Pro / Premium ($9 - $15/mes)**.
 * - Límite de enlaces dinámicos: Hasta 50 enlaces activos.
 * - Retención de analíticas: 365 días (histórico anual para comparar tendencias).
 * - Personalización del QR: Sí (colores hexadecimales de marca y logo SVG/PNG al centro).
 * - Dominio personalizado: Sí (soporte para subdominio CNAME propio).
 * - Enfoque de monetización: Suscripción recurrente para negocios en crecimiento o múltiples sucursales.
 */
@Injectable()
export class ProPlanStrategy extends BasePlanStrategy {
  constructor(@Optional() config: PlanConfig = PRO_PLAN_CONFIG) {
    super(config || PRO_PLAN_CONFIG);
  }
}
