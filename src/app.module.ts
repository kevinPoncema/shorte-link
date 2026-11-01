import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from './billing/billing.module';
import { CoreModule } from './core/core.module';
import { PlansModule } from './plans/plans.module';

/**
 * Módulo raíz de la plataforma **Dynamic QR & Link Shortener API**.
 * Orquesta la configuración global de variables de entorno, la conexión a PostgreSQL
 * vía TypeORM y los tres dominios desacoplados: `PlansModule`, `BillingModule` y `CoreModule`.
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
        autoLoadEntities: true,
        synchronize:
          configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        logging: configService.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),
    PlansModule,
    BillingModule,
    CoreModule,
  ],
})
export class AppModule {}
