import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from '../core/core.module';
import { BillingController } from './controllers/billing.controller';
import { ORDER_REPOSITORY } from './interfaces/order-repository.interface';
import { SUBSCRIPTION_REPOSITORY } from './interfaces/subscription-repository.interface';
import { OrderItem } from './models/order-item.entity';
import { Order } from './models/order.entity';
import { Subscription } from './models/subscription.entity';
import { TypeOrmOrderRepository } from './repositories/typeorm-order.repository';
import { TypeOrmSubscriptionRepository } from './repositories/typeorm-subscription.repository';
import { BillingService } from './services/billing.service';
import { StripeService } from './services/stripe.service';

/**
 * Módulo de facturación (`BillingModule`).
 * Administra suscripciones recurrentes SaaS, compra de insumos físicos (Feature-Flagged),
 * integración con Stripe Checkout y sincronización asíncrona vía Webhooks.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Order, OrderItem]),
    CoreModule,
  ],
  controllers: [BillingController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    {
      provide: ORDER_REPOSITORY,
      useClass: TypeOrmOrderRepository,
    },
    StripeService,
    BillingService,
  ],
  exports: [
    BillingService,
    StripeService,
    SUBSCRIPTION_REPOSITORY,
    ORDER_REPOSITORY,
    TypeOrmModule,
  ],
})
export class BillingModule {}
