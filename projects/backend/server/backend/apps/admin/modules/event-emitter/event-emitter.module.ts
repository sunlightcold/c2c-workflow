import { Global, Module } from '@nestjs/common'
import { EventEmitterModule as EventModule } from '@nestjs/event-emitter'
import { EventEmitterService } from './event-emitter.service'

@Global()
@Module({
  imports: [EventModule.forRoot({ maxListeners: 20, ignoreErrors: false })],
  controllers: [],
  providers: [EventEmitterService],
  exports: [EventEmitterService],
})
export class EventEmitterModule {}
