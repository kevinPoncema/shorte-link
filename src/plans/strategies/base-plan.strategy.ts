import { ForbiddenException } from '@nestjs/common';
import { PlanStrategy } from '../interfaces/plan-strategy.interface';

/**
 * Esquema de configuración de un nivel de suscripción.
 *
 * Desacopla los valores numéricos y booleanos de los métodos de la estrategia,
 * permitiendo una parametrización dinámica y reutilizable.
 */
export interface PlanConfig {
  readonly tierName: string;
  readonly displayName: string;
  readonly monetizationModel: string;
  readonly maxActiveLinks: number;
  readonly analyticsRetentionDays: number;
  readonly canCustomizeQrDesign: boolean;
  readonly canUseCustomDomain: boolean;
  readonly upgradeMessage?: string;
}

/**
 * Clase base abstracta para todas las estrategias de planes del sistema.
 *
 * Implementa la interfaz `PlanStrategy` centralizando la lógica algorítmica de:
 * 1. Control de cuotas de creación de enlaces (`assertCanCreateLink`).
 * 2. Validación de límites y lanzamiento de excepciones de dominio (`throwQuotaExceededError`).
 * 3. Exposición de capacidades y políticas de retención sin valores quemados.
 */
export abstract class BasePlanStrategy implements PlanStrategy {
  readonly tierName: string;
  readonly displayName: string;
  readonly monetizationModel: string;
  protected readonly maxActiveLinks: number;
  protected readonly analyticsRetentionDays: number;
  protected readonly customQrDesignAllowed: boolean;
  protected readonly customDomainAllowed: boolean;
  protected readonly upgradeMessage?: string;

  constructor(config: PlanConfig) {
    this.tierName = config.tierName;
    this.displayName = config.displayName;
    this.monetizationModel = config.monetizationModel;
    this.maxActiveLinks = config.maxActiveLinks;
    this.analyticsRetentionDays = config.analyticsRetentionDays;
    this.customQrDesignAllowed = config.canCustomizeQrDesign;
    this.customDomainAllowed = config.canUseCustomDomain;
    this.upgradeMessage = config.upgradeMessage;
  }

  /**
   * Orquesta la verificación del cumplimiento de cuotas de creación de enlaces.
   * Lanza `ForbiddenException` si el usuario ha alcanzado o superado el límite de su plan.
   */
  assertCanCreateLink(currentCount: number): void {
    if (this.hasReachedLinkLimit(currentCount)) {
      this.throwQuotaExceededError();
    }
  }

  /**
   * Retorna si el plan permite personalizar colores y logos en los códigos QR.
   */
  canCustomizeQrDesign(): boolean {
    return this.customQrDesignAllowed;
  }

  /**
   * Retorna si el plan habilita el uso de dominios o subdominios personalizados.
   */
  canUseCustomDomain(): boolean {
    return this.customDomainAllowed;
  }

  /**
   * Retorna el número máximo de enlaces dinámicos activos permitidos.
   */
  getMaxActiveLinks(): number {
    return this.maxActiveLinks;
  }

  /**
   * Retorna el número de días de retención de analíticas en el plan.
   */
  getAnalyticsRetentionDays(): number {
    return this.analyticsRetentionDays;
  }

  /**
   * Determina si la cantidad actual de enlaces alcanza o excede la cuota permitida.
   */
  protected hasReachedLinkLimit(currentCount: number): boolean {
    return currentCount >= this.maxActiveLinks;
  }

  /**
   * Emite el error estandarizado de cuota excedida con sugerencia opcional de upgrade.
   */
  protected throwQuotaExceededError(): never {
    const hint = this.upgradeMessage ? ` ${this.upgradeMessage}` : '';
    throw new ForbiddenException(
      `Maximum links quota (${this.maxActiveLinks}) reached for plan ${this.tierName}.${hint}`,
    );
  }
}
