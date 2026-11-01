import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PLAN_REPOSITORY } from './interfaces/plan-repository.interface';
import { PLAN_STRATEGIES } from './interfaces/plan-strategy.interface';
import { Plan } from './models/plan.entity';
import { TypeOrmPlanRepository } from './repositories/typeorm-plan.repository';
import { PlanContextService } from './services/plan-context.service';
import { ProPlanStrategy } from './strategies/pro-plan.strategy';
import { StarterPlanStrategy } from './strategies/starter-plan.strategy';

/**
 * Módulo de motor de planes y cuotas (`PlansModule`).
 * Registra las estrategias de negocio `StarterPlanStrategy` (plan por defecto) y
 * `ProPlanStrategy`, además de exponer `PlanContextService` y `PLAN_REPOSITORY`.
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
  ],
  exports: [
    PlanContextService,
    StarterPlanStrategy,
    ProPlanStrategy,
    PLAN_REPOSITORY,
    TypeOrmModule,
  ],
})
export class PlansModule {}
