import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  PLAN_STRATEGIES,
  PlanStrategy,
} from '../interfaces/plan-strategy.interface';
import { ProPlanStrategy } from '../strategies/pro-plan.strategy';
import { StarterPlanStrategy } from '../strategies/starter-plan.strategy';

/**
 * Contexto en memoria del patrón Strategy para la resolución de planes de suscripción.
 *
 * Mantiene un catálogo en memoria indexado en `Map` que garantiza una resolución en complejidad O(1).
 * Totalmente desacoplado de la persistencia de datos (la siembra de base de datos se realiza
 * de forma independiente mediante el comando Seeder).
 */
@Injectable()
export class PlanContextService {
  private readonly logger = new Logger(PlanContextService.name);
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
   * Registra una estrategia indexándola por su `tierName` canónico y sus alias en O(1).
   */
  registerStrategy(strategy: PlanStrategy, aliases: string[] = []): void {
    this.indexStrategyKey(strategy.tierName, strategy);
    for (const alias of aliases) {
      this.indexStrategyKey(alias, strategy);
    }
  }

  /**
   * **Orquestador de Resolución de Estrategia (`O(1)`):**
   * 1. Normaliza la clave del plan recibida desde el JWT o usuario.
   * 2. Busca la estrategia registrada en el mapa en memoria en tiempo O(1).
   * 3. Si es nula, vacía o desconocida, retorna `StarterPlanStrategy` como fallback seguro.
   */
  getStrategy(planKey?: string | null): PlanStrategy {
    const normalizedKey = this.normalizePlanKey(planKey);
    if (!normalizedKey) {
      return this.starterPlanStrategy;
    }

    return this.lookupStrategy(normalizedKey) ?? this.starterPlanStrategy;
  }

  /**
   * Verifica en O(1) si un identificador de plan o alias está registrado en el catálogo.
   */
  isRegistered(planKey?: string | null): boolean {
    const normalizedKey = this.normalizePlanKey(planKey);
    if (!normalizedKey) {
      return false;
    }
    return (
      this.strategies.has(normalizedKey) ||
      this.strategies.has(normalizedKey.toUpperCase())
    );
  }

  /**
   * Obtiene la lista de niveles (tiers) canónicos únicos registrados en el catálogo en memoria.
   */
  getRegisteredTiers(): string[] {
    const uniqueTiers = new Set<string>();
    for (const strategy of this.strategies.values()) {
      uniqueTiers.add(strategy.tierName.toUpperCase());
    }
    return Array.from(uniqueTiers);
  }

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

    this.logger.debug(
      `PlanContextService inicializado con niveles registrados (O(1)): ${this.getRegisteredTiers().join(', ')}`,
    );
  }

  /**
   * Indexa una clave en versión original y mayúsculas dentro del `Map` en O(1).
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
   * Busca la estrategia por clave exacta o en mayúsculas en tiempo O(1).
   */
  private lookupStrategy(key: string): PlanStrategy | undefined {
    return this.strategies.get(key) ?? this.strategies.get(key.toUpperCase());
  }
}
