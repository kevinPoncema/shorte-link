import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { LinksModule } from './links/links.module';

@Module({
  imports: [AuthModule, CacheModule, LinksModule],
  exports: [AuthModule, CacheModule, LinksModule],
})
export class CoreModule {}
