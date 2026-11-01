import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from '../core/core.module';
import { BillingController } from './controllers/billing.controller';
import { Subscription } from './models/subscription.entity';
import { BillingService } from './services/billing.service';

/**
 * Módulo base de facturación y suscripciones (`BillingModule`).
 * Registra la entidad `Subscription` y expone endpoints base autenticados
 * listos para futura integración con webhooks de pasarela de pago.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Subscription]), CoreModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService, TypeOrmModule],
})
export class BillingModule {}
