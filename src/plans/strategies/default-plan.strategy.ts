import { Injectable } from '@nestjs/common';
import { PlanStrategy } from '../interfaces/plan-strategy.interface';

/**
 * Estrategia predeterminada (`DEFAULT`) utilizada durante la fase inicial y como
 * fallback seguro cuando un token JWT no especifica un plan registrado.
 * No impone restricciones de cuota ni de personalización de QR.
 */
@Injectable()
export class DefaultPlanStrategy implements PlanStrategy {
  readonly tierName = 'DEFAULT';

  /** Permite creación ilimitada de enlaces sin lanzar excepciones. */
  assertCanCreateLink(_currentCount: number): void {
    // Sin restricción de cuota en el plan DEFAULT.
  }

  /** Habilita personalización completa de diseño QR (`qrConfig`). */
  canCustomizeQrDesign(): boolean {
    return true;
  }

  /** Permite enlaces activos ilimitados (`Infinity`). */
  getMaxActiveLinks(): number {
    return Infinity;
  }

  /** Retención amplia de métricas (365 días). */
  getAnalyticsRetentionDays(): number {
    return 365;
  }
}
