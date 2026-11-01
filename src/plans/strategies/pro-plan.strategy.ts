import { ForbiddenException, Injectable } from '@nestjs/common';
import { PlanStrategy } from '../interfaces/plan-strategy.interface';

export const PRO_MAX_ACTIVE_LINKS = 50;
export const PRO_ANALYTICS_RETENTION_DAYS = 365;

/**
 * Estrategia para el **Plan Pro / Premium ($9 - $15/mes)**.
 * - Límite de enlaces dinámicos: Hasta 50 enlaces activos.
 * - Retención de analíticas: 365 días (histórico anual para comparar tendencias).
 * - Personalización del QR: Sí (colores hexadecimales de marca y logo SVG/PNG al centro).
 * - Dominio personalizado: Sí (soporte para subdominio CNAME propio).
 * - Enfoque de monetización: Suscripción recurrente para negocios en crecimiento o múltiples sucursales.
 */
@Injectable()
export class ProPlanStrategy implements PlanStrategy {
  readonly tierName = 'PRO';
  readonly displayName = 'Plan Pro / Premium ($9 - $15/mes)';
  readonly monetizationModel =
    'Suscripción recurrente para negocios en crecimiento o múltiples sucursales';

  /**
   * Orquesta la validación de cuota de creación para el Plan Pro (máximo 50 enlaces).
   */
  assertCanCreateLink(currentCount: number): void {
    if (this.hasReachedLinkLimit(currentCount)) {
      this.throwQuotaExceededError();
    }
  }

  /** Habilita colores hexadecimales de marca y logo SVG/PNG al centro. */
  canCustomizeQrDesign(): boolean {
    return true;
  }

  /** Habilita soporte para subdominio CNAME propio. */
  canUseCustomDomain(): boolean {
    return true;
  }

  /** Hasta 50 enlaces dinámicos activos simultáneos. */
  getMaxActiveLinks(): number {
    return PRO_MAX_ACTIVE_LINKS;
  }

  /** 365 días de retención de analíticas (histórico anual). */
  getAnalyticsRetentionDays(): number {
    return PRO_ANALYTICS_RETENTION_DAYS;
  }

  // ===========================================================================
  // Funciones Auxiliares (Single Responsibility Principle)
  // ===========================================================================

  private hasReachedLinkLimit(currentCount: number): boolean {
    return currentCount >= PRO_MAX_ACTIVE_LINKS;
  }

  private throwQuotaExceededError(): never {
    throw new ForbiddenException(
      `Maximum links quota (${PRO_MAX_ACTIVE_LINKS}) reached for plan ${this.tierName}.`,
    );
  }
}
