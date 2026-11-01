import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PLAN_REPOSITORY } from './interfaces/plan-repository.interface';
import { PLAN_STRATEGIES } from './interfaces/plan-strategy.interface';
import { Plan } from './models/plan.entity';
import { TypeOrmPlanRepository } from './repositories/typeorm-plan.repository';
import { PlanContextService } from './services/plan-context.service';
import { DefaultPlanStrategy } from './strategies/default-plan.strategy';

/**
 * Módulo de motor de planes y cuotas (`PlansModule`).
 * Expone `PlanContextService` y el contrato `PLAN_REPOSITORY` para desacoplar
 * la lógica de persistencia de los servicios consumidores.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Plan])],
  providers: [
    DefaultPlanStrategy,
    {
      provide: PLAN_STRATEGIES,
      useFactory: (defaultStrategy: DefaultPlanStrategy) => [defaultStrategy],
      inject: [DefaultPlanStrategy],
    },
    {
      provide: PLAN_REPOSITORY,
      useClass: TypeOrmPlanRepository,
    },
    PlanContextService,
  ],
  exports: [PlanContextService, PLAN_REPOSITORY, TypeOrmModule],
})
export class PlansModule {}
