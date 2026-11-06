import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './billing/models/order-item.entity';
import { Order } from './billing/models/order.entity';
import { Subscription } from './billing/models/subscription.entity';
import { LinkEvent } from './core/models/link-event.entity';
import { Link } from './core/models/link.entity';
import { User } from './core/models/user.entity';
import { Plan } from './plans/models/plan.entity';
import { PlansModule } from './plans/plans.module';

/**
 * Módulo ligero para ejecución de comandos Seeder.
 *
 * Carga únicamente la configuración esencial y la conexión a PostgreSQL vía TypeORM,
 * junto con el módulo de planes, sin levantar servidores HTTP, Redis, ni workers en segundo plano.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: Number(configService.get<number>('DB_PORT', 5432)),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'qr_shortener'),
        entities: [Plan, User, Link, LinkEvent, Subscription, Order, OrderItem],
        autoLoadEntities: true,
        synchronize:
          configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        logging: configService.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),
    PlansModule,
  ],
})
export class SeederModule {}
