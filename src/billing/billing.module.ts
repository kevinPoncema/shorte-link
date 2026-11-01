import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from '../core/core.module';
import { BillingController } from './controllers/billing.controller';
import { SUBSCRIPTION_REPOSITORY } from './interfaces/subscription-repository.interface';
import { Subscription } from './models/subscription.entity';
import { TypeOrmSubscriptionRepository } from './repositories/typeorm-subscription.repository';
import { BillingService } from './services/billing.service';

/**
 * Módulo base de facturación y suscripciones (`BillingModule`).
 * Registra el adaptador de repositorio `SUBSCRIPTION_REPOSITORY` y expone endpoints base
 * autenticados listos para futura integración con webhooks de pasarela de pago.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Subscription]), CoreModule],
  controllers: [BillingController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    BillingService,
  ],
  exports: [BillingService, SUBSCRIPTION_REPOSITORY, TypeOrmModule],
})
export class BillingModule {}
