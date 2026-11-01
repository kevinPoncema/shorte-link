import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { PlansModule } from '../plans/plans.module';
import { AuthController } from './auth/controllers/auth.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthService } from './auth/services/auth.service';
import { CacheService, REDIS_CLIENT } from './cache/cache.service';
import { LinksController } from './links/controllers/links.controller';
import { RedirectController } from './links/controllers/redirect.controller';
import { LinksService } from './links/services/links.service';
import { LinkEvent } from './models/link-event.entity';
import { Link } from './models/link.entity';
import { User } from './models/user.entity';

/**
 * Módulo central de negocio (`CoreModule`).
 * Encapsula la autenticación JWT stateless, la administración de enlaces y QR dinámicos,
 * la capa en memoria Redis (`ioredis`) y el Fast-Path público de redirección `GET /:shortCode`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Link, LinkEvent]),
    PlansModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_SECRET',
          'dev-fallback-jwt-secret',
        ),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '1d',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController, LinksController, RedirectController],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const password = configService.get<string>('REDIS_PASSWORD');
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: Number(configService.get<number>('REDIS_PORT', 6379)),
          password: password || undefined,
          db: Number(configService.get<number>('REDIS_DB', 0)),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        });
      },
    },
    CacheService,
    AuthService,
    JwtAuthGuard,
    LinksService,
  ],
  exports: [
    CacheService,
    AuthService,
    JwtAuthGuard,
    JwtModule,
    LinksService,
    TypeOrmModule,
  ],
})
export class CoreModule {}
