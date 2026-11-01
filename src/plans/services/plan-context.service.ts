import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PLAN_STRATEGIES,
  PlanStrategy,
} from '../interfaces/plan-strategy.interface';
import { DefaultPlanStrategy } from '../strategies/default-plan.strategy';

/**
 * Servicio de contexto del patrón **Strategy** para `PlansModule`.
 * Mantiene en memoria un `Map<string, PlanStrategy>` libre de consultas a base de datos
 * para resolver en `O(1)` las reglas aplicables al campo `req.user.plan` del JWT.
 */
@Injectable()
export class PlanContextService {
  private readonly strategies = new Map<string, PlanStrategy>();

  constructor(
    private readonly defaultPlanStrategy: DefaultPlanStrategy,
    @Optional()
    @Inject(PLAN_STRATEGIES)
    registeredStrategies: PlanStrategy[] = [],
  ) {
    this.registerStrategy(this.defaultPlanStrategy);
    for (const strategy of registeredStrategies) {
      this.registerStrategy(strategy);
    }
  }

  /**
   * Registra o reemplaza una estrategia indexándola por su `tierName` exacto y en mayúsculas.
   */
  registerStrategy(strategy: PlanStrategy): void {
    this.strategies.set(strategy.tierName, strategy);
    this.strategies.set(strategy.tierName.toUpperCase(), strategy);
  }

  /**
   * Resuelve la estrategia correspondiente a `planKey`.
   * Si la clave es nula, indefinida, vacía o no existe en el `Map`, retorna `DefaultPlanStrategy`.
   */
  getStrategy(planKey?: string | null): PlanStrategy {
    if (!planKey) {
      return this.defaultPlanStrategy;
    }

    return (
      this.strategies.get(planKey) ??
      this.strategies.get(planKey.toUpperCase()) ??
      this.defaultPlanStrategy
    );
  }
}
