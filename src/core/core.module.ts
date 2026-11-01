import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { PlansModule } from '../plans/plans.module';
import { AuthController } from './auth/controllers/auth.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { USER_REPOSITORY } from './auth/interfaces/user-repository.interface';
import { TypeOrmUserRepository } from './auth/repositories/typeorm-user.repository';
import { AuthService } from './auth/services/auth.service';
import { UsersService } from './auth/services/users.service';
import { CacheService, REDIS_CLIENT } from './cache/cache.service';
import { ClickQueueService } from './cache/click-queue.service';
import { LinksController } from './links/controllers/links.controller';
import { RedirectController } from './links/controllers/redirect.controller';
import { LINK_EVENT_REPOSITORY } from './links/interfaces/link-event-repository.interface';
import { LINK_REPOSITORY } from './links/interfaces/link-repository.interface';
import { TypeOrmLinkEventRepository } from './links/repositories/typeorm-link-event.repository';
import { TypeOrmLinkRepository } from './links/repositories/typeorm-link.repository';
import { LinkStatsService } from './links/services/link-stats.service';
import { LinksService } from './links/services/links.service';
import { AnalyticsWorkerService } from './links/workers/analytics-worker.service';
import { LinkEvent } from './models/link-event.entity';
import { Link } from './models/link.entity';
import { User } from './models/user.entity';

/**
 * Módulo central de negocio (`CoreModule`).
 * Encapsula la autenticación JWT stateless, la administración de enlaces y QR dinámicos,
 * las estadísticas analíticas (`LinkStatsService`), los adaptadores de repositorio
 * (`USER_REPOSITORY`, `LINK_REPOSITORY`, `LINK_EVENT_REPOSITORY`), la capa en memoria
 * Redis (`ioredis`) y el Fast-Path público de redirección `GET /:shortCode`.
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
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
    {
      provide: LINK_REPOSITORY,
      useClass: TypeOrmLinkRepository,
    },
    {
      provide: LINK_EVENT_REPOSITORY,
      useClass: TypeOrmLinkEventRepository,
    },
    CacheService,
    ClickQueueService,
    AuthService,
    UsersService,
    JwtAuthGuard,
    LinksService,
    LinkStatsService,
    AnalyticsWorkerService,
  ],
  exports: [
    USER_REPOSITORY,
    LINK_REPOSITORY,
    LINK_EVENT_REPOSITORY,
    CacheService,
    ClickQueueService,
    AuthService,
    UsersService,
    JwtAuthGuard,
    JwtModule,
    LinksService,
    LinkStatsService,
    AnalyticsWorkerService,
    TypeOrmModule,
  ],
})
export class CoreModule {}
