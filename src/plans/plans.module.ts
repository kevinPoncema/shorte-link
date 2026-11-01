import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PLAN_REPOSITORY } from './interfaces/plan-repository.interface';
import { PLAN_STRATEGIES } from './interfaces/plan-strategy.interface';
import { Plan } from './models/plan.entity';
import { TypeOrmPlanRepository } from './repositories/typeorm-plan.repository';
import { PlanSeeder } from './seeders/plan.seeder';
import { PlanContextService } from './services/plan-context.service';
import { BasePlanStrategy, PlanConfig } from './strategies/base-plan.strategy';
import { ProPlanStrategy } from './strategies/pro-plan.strategy';
import { StarterPlanStrategy } from './strategies/starter-plan.strategy';

/**
 * Módulo de motor de planes y cuotas (`PlansModule`).
 * Registra las estrategias de negocio `StarterPlanStrategy` y `ProPlanStrategy`,
 * el servicio de contexto en memoria `PlanContextService`, el repositorio `PLAN_REPOSITORY`
 * y el seeder idempotente de base de datos `PlanSeeder`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Plan])],
  providers: [
    StarterPlanStrategy,
    ProPlanStrategy,
    {
      provide: PLAN_STRATEGIES,
      useFactory: (
        starterStrategy: StarterPlanStrategy,
        proStrategy: ProPlanStrategy,
      ) => [starterStrategy, proStrategy],
      inject: [StarterPlanStrategy, ProPlanStrategy],
    },
    {
      provide: PLAN_REPOSITORY,
      useClass: TypeOrmPlanRepository,
    },
    PlanContextService,
    PlanSeeder,
  ],
  exports: [
    PlanContextService,
    BasePlanStrategy,
    StarterPlanStrategy,
    ProPlanStrategy,
    PLAN_REPOSITORY,
    TypeOrmModule,
    PlanSeeder,
  ],
})
export class PlansModule {}
