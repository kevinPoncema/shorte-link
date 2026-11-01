import { ForbiddenException, Injectable } from '@nestjs/common';
import { PlanStrategy } from '../interfaces/plan-strategy.interface';

export const STARTER_MAX_ACTIVE_LINKS = 3;
export const STARTER_ANALYTICS_RETENTION_DAYS = 7;

/**
 * Estrategia para el **Plan Starter (Gratuito / Físico)**.
 * Reemplaza la antigua estrategia por defecto aplicando las reglas de negocio reales:
 * - Límite de enlaces dinámicos: Hasta 3 enlaces activos.
 * - Retención de analíticas: 7 días (purga automática semanal para no saturar disco).
 * - Personalización del QR: No (renderizado estándar en blanco y negro).
 * - Dominio personalizado: No (utiliza el dominio base del servicio).
 * - Enfoque de monetización: Incluido de por vida con la compra del acrílico o chip NFC.
 */
@Injectable()
export class StarterPlanStrategy implements PlanStrategy {
  readonly tierName = 'STARTER';
  readonly displayName = 'Plan Starter (Gratuito / Físico)';
  readonly monetizationModel =
    'Incluido de por vida con la compra del acrílico o chip NFC';

  /**
   * Orquesta la validación de cuota de creación para el Plan Starter (máximo 3 enlaces).
   */
  assertCanCreateLink(currentCount: number): void {
    if (this.hasReachedLinkLimit(currentCount)) {
      this.throwQuotaExceededError();
    }
  }

  /** Renderizado estándar en blanco y negro (sin colores de marca ni logo central). */
  canCustomizeQrDesign(): boolean {
    return false;
  }

  /** Utiliza exclusivamente el dominio base del servicio (sin soporte CNAME propio). */
  canUseCustomDomain(): boolean {
    return false;
  }

  /** Hasta 3 enlaces dinámicos activos simultáneos. */
  getMaxActiveLinks(): number {
    return STARTER_MAX_ACTIVE_LINKS;
  }

  /** 7 días de retención de analíticas (purga automática semanal). */
  getAnalyticsRetentionDays(): number {
    return STARTER_ANALYTICS_RETENTION_DAYS;
  }

  // ===========================================================================
  // Funciones Auxiliares (Single Responsibility Principle)
  // ===========================================================================

  private hasReachedLinkLimit(currentCount: number): boolean {
    return currentCount >= STARTER_MAX_ACTIVE_LINKS;
  }

  private throwQuotaExceededError(): never {
    throw new ForbiddenException(
      `Maximum links quota (${STARTER_MAX_ACTIVE_LINKS}) reached for plan ${this.tierName}. Upgrade to PRO for up to 50 active links.`,
    );
  }
}
