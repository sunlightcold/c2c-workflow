import { getConfig } from '@/common/utils'
import { Global, Module } from '@nestjs/common'
import { RedisModule } from '@nestjs-modules/ioredis'
import { CacheService } from './cache.service'

const redisConfig = getConfig('admin').redis

@Global()
@Module({
  imports: [
    RedisModule.forRootAsync({
      useFactory: () => ({
        type: 'single',
        url: redisConfig.url,
      }),
    }),
  ],
  controllers: [],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
