import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService, REDIS_CLIENT } from './cache.service';
import { ClickQueueService } from './click-queue.service';

@Module({
  imports: [ConfigModule],
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
    ClickQueueService,
  ],
  exports: [REDIS_CLIENT, CacheService, ClickQueueService],
})
export class CacheModule {}
