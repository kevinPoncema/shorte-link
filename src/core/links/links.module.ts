import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansModule } from '../../plans/plans.module';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { LinkEvent } from '../models/link-event.entity';
import { Link } from '../models/link.entity';
import { LinksController } from './controllers/links.controller';
import { RedirectController } from './controllers/redirect.controller';
import { LINK_EVENT_REPOSITORY } from './interfaces/link-event-repository.interface';
import { LINK_REPOSITORY } from './interfaces/link-repository.interface';
import { TypeOrmLinkEventRepository } from './repositories/typeorm-link-event.repository';
import { TypeOrmLinkRepository } from './repositories/typeorm-link.repository';
import { LinkStatsService } from './services/link-stats.service';
import { LinksService } from './services/links.service';
import { AnalyticsWorkerService } from './workers/analytics-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Link, LinkEvent]),
    PlansModule,
    AuthModule,
    CacheModule,
  ],
  controllers: [LinksController, RedirectController],
  providers: [
    {
      provide: LINK_REPOSITORY,
      useClass: TypeOrmLinkRepository,
    },
    {
      provide: LINK_EVENT_REPOSITORY,
      useClass: TypeOrmLinkEventRepository,
    },
    LinksService,
    LinkStatsService,
    AnalyticsWorkerService,
  ],
  exports: [
    LINK_REPOSITORY,
    LINK_EVENT_REPOSITORY,
    LinksService,
    LinkStatsService,
    AnalyticsWorkerService,
    TypeOrmModule,
  ],
})
export class LinksModule {}
