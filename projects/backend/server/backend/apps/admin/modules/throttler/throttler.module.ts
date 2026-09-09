import { IThrottlerGuard } from '@/common/guards'
import { getConfig } from '@/common/utils'
import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
const adminConfig = getConfig('admin')

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: adminConfig.throttlerTTL, limit: adminConfig.throttlerLimit }],
    }),
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: IThrottlerGuard }],
})
export class IThrottlerModule {}
