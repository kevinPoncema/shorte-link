import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  IPlanRepository,
  PLAN_REPOSITORY,
} from '../interfaces/plan-repository.interface';
import {
  PLAN_STRATEGIES,
  PlanStrategy,
} from '../interfaces/plan-strategy.interface';
import { ProPlanStrategy } from '../strategies/pro-plan.strategy';
import { StarterPlanStrategy } from '../strategies/starter-plan.strategy';

/**
 * Seeder de base de datos para la siembra idempotente del catálogo de planes.
 *
 * Desacoplado del servicio en memoria `PlanContextService`. Se ejecuta como comando
 * CLI o en el arranque del contenedor antes de iniciar la API para asegurar
 * la existencia de los planes en PostgreSQL y evitar errores de integridad referencial.
 */
@Injectable()
export class PlanSeeder {
  private readonly logger = new Logger(PlanSeeder.name);

  constructor(
    @Inject(PLAN_REPOSITORY)
    private readonly planRepository: IPlanRepository,
    @Optional()
    @Inject(PLAN_STRATEGIES)
    private readonly registeredStrategies: PlanStrategy[] = [],
  ) {}

  /**
   * Ejecuta la siembra idempotente del catálogo de planes en la base de datos.
   *
   * 1. Consulta la lista de planes existentes en la base de datos una única vez.
   * 2. Determina los planes a sembrar (STARTER, PRO y estrategias registradas).
   * 3. Si un plan ya existe, omite su inserción para garantizar idempotencia.
   * 4. Si no existe, lo inserta de forma segura.
   */
  async seed(): Promise<void> {
    this.logger.log('Iniciando siembra idempotente de planes en base de datos...');

    const existingPlans = await this.planRepository.findAll();
    const existingIds = new Set(
      existingPlans.map((plan) => plan.id.toUpperCase().trim()),
    );

    this.logger.log(
      `Planes existentes actualmente en la base de datos: [${Array.from(existingIds).join(', ')}]`,
    );

    const strategiesToSeed = this.collectStrategiesToSeed();

    let createdCount = 0;
    let skippedCount = 0;

    for (const strategy of strategiesToSeed) {
      const tierId = strategy.tierName.toUpperCase().trim();

      if (existingIds.has(tierId)) {
        this.logger.log(
          `Plan '${tierId}' ya existe en la base de datos. Omitiendo creación.`,
        );
        skippedCount++;
        continue;
      }

      try {
        await this.planRepository.createAndSave({
          id: tierId,
          name: strategy.displayName,
          isActive: true,
        });
        existingIds.add(tierId);
        createdCount++;
        this.logger.log(
          `Plan '${tierId}' (${strategy.displayName}) creado exitosamente en el catálogo.`,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Error al sembrar el plan '${tierId}': ${(err as Error).message}`,
          (err as Error).stack,
        );
        throw err;
      }
    }

    this.logger.log(
      `Siembra de planes completada: ${createdCount} creados, ${skippedCount} omitidos (ya existentes).`,
    );
  }

  /**
   * Recopila la lista deduplicada de estrategias a sembrar.
   */
  private collectStrategiesToSeed(): PlanStrategy[] {
    const strategyMap = new Map<string, PlanStrategy>();

    // Estrategias canónicas por defecto
    const starter = new StarterPlanStrategy();
    const pro = new ProPlanStrategy();
    strategyMap.set(starter.tierName.toUpperCase().trim(), starter);
    strategyMap.set(pro.tierName.toUpperCase().trim(), pro);

    // Estrategias inyectadas
    for (const strat of this.registeredStrategies) {
      strategyMap.set(strat.tierName.toUpperCase().trim(), strat);
    }

    return Array.from(strategyMap.values());
  }
}
