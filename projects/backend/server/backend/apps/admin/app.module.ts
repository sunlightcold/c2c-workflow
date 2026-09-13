import { RequestIpMiddlewareModule, TokenMiddlewareModule } from '@/common/middlewares'
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { DatabaseModule } from './database'
import { InitService } from './init'
import { LogInterceptor } from './interceptors'
import { BullMqModule } from './modules/bullmq'
import { CacheModule } from './modules/cache'
import { EventEmitterModule } from './modules/event-emitter'
import { LoggerModule } from './modules/logger'
import { OssModule } from './modules/oss'
import { SocketModule } from './modules/socket/socket.module'
import { StaticModule } from './modules/static'
import { SystemModule } from './modules/system'
import { TutorialPublicModule } from './modules/system/tutorial/tutorial-public.module'
import { AuthModule } from './modules/system/auth'
import { IThrottlerModule } from './modules/throttler'

@Module({
  imports: [
    IThrottlerModule,
    CacheModule,
    BullMqModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    SocketModule,
    EventEmitterModule,
    StaticModule,
    LoggerModule,
    SystemModule,
    TutorialPublicModule,
    RequestIpMiddlewareModule,
    TokenMiddlewareModule,
    OssModule,
  ],
  controllers: [],
  providers: [InitService, { provide: APP_INTERCEPTOR, useClass: LogInterceptor }],
})
export class AppModule {}
