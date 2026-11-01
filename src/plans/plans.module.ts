import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PLAN_STRATEGIES } from './interfaces/plan-strategy.interface';
import { Plan } from './models/plan.entity';
import { PlanContextService } from './services/plan-context.service';
import { DefaultPlanStrategy } from './strategies/default-plan.strategy';

/**
 * Módulo de motor de planes y cuotas (`PlansModule`).
 * Expone `PlanContextService` para resolver en memoria la `PlanStrategy` correspondiente
 * sin acoplar lógica de base de datos a los controladores ni servicios consumidores.
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
    PlanContextService,
  ],
  exports: [PlanContextService, TypeOrmModule],
})
export class PlansModule {}
