import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PLAN_STRATEGIES,
  PlanStrategy,
} from '../interfaces/plan-strategy.interface';
import { ProPlanStrategy } from '../strategies/pro-plan.strategy';
import { StarterPlanStrategy } from '../strategies/starter-plan.strategy';

/**
 * Servicio de contexto del patrón **Strategy** para `PlansModule`.
 * Mantiene en memoria un `Map<string, PlanStrategy>` libre de consultas SQL
 * para resolver en `O(1)` las reglas aplicables al campo `req.user.plan` del JWT.
 */
@Injectable()
export class PlanContextService {
  private readonly strategies = new Map<string, PlanStrategy>();

  constructor(
    private readonly starterPlanStrategy: StarterPlanStrategy,
    @Optional()
    private readonly proPlanStrategy?: ProPlanStrategy,
    @Optional()
    @Inject(PLAN_STRATEGIES)
    registeredStrategies: PlanStrategy[] = [],
  ) {
    this.initializeStrategyCatalog(registeredStrategies);
  }

  /**
   * **Orquestador de Registro de Estrategias:**
   * Registra una estrategia indexándola por su `tierName` canónico y en mayúsculas.
   */
  registerStrategy(strategy: PlanStrategy, aliases: string[] = []): void {
    this.indexStrategyKey(strategy.tierName, strategy);
    for (const alias of aliases) {
      this.indexStrategyKey(alias, strategy);
    }
  }

  /**
   * **Orquestador de Resolución de Estrategia (`O(1)`):**
   * 1. Normaliza la clave del plan recibida desde el JWT.
   * 2. Busca la estrategia registrada en el mapa en memoria.
   * 3. Si es nula, vacía o desconocida, retorna `StarterPlanStrategy` como fallback seguro.
   */
  getStrategy(planKey?: string | null): PlanStrategy {
    const normalizedKey = this.normalizePlanKey(planKey);
    if (!normalizedKey) {
      return this.starterPlanStrategy;
    }

    return this.lookupStrategy(normalizedKey) ?? this.starterPlanStrategy;
  }

  // ===========================================================================
  // Funciones Auxiliares (Single Responsibility Principle)
  // ===========================================================================

  /**
   * Inicializa el catálogo base (`STARTER`, `PRO`) y las estrategias inyectadas por módulo.
   */
  private initializeStrategyCatalog(
    registeredStrategies: PlanStrategy[],
  ): void {
    this.registerStrategy(this.starterPlanStrategy, ['DEFAULT', 'FREE']);

    const proInstance = this.proPlanStrategy ?? new ProPlanStrategy();
    this.registerStrategy(proInstance, ['PREMIUM']);

    for (const strategy of registeredStrategies) {
      this.registerStrategy(strategy);
    }
  }

  /**
   * Indexa una clave en versión original y mayúsculas dentro del `Map`.
   */
  private indexStrategyKey(key: string, strategy: PlanStrategy): void {
    const trimmed = key.trim();
    if (!trimmed) {
      return;
    }
    this.strategies.set(trimmed, strategy);
    this.strategies.set(trimmed.toUpperCase(), strategy);
  }

  /**
   * Limpia y normaliza la clave del plan o retorna `null` si está vacía.
   */
  private normalizePlanKey(planKey?: string | null): string | null {
    if (!planKey) {
      return null;
    }
    const trimmed = planKey.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Busca la estrategia por clave exacta o en mayúsculas.
   */
  private lookupStrategy(key: string): PlanStrategy | undefined {
    return this.strategies.get(key) ?? this.strategies.get(key.toUpperCase());
  }
}
