import { Global, Module } from '@nestjs/common'
import { LogController } from './log.controller'
import { LogService } from './log.service'
import { TaskLogService } from './task-log.service'

@Global()
@Module({
  imports: [],
  controllers: [LogController],
  providers: [LogService, TaskLogService],
  exports: [LogService, TaskLogService],
})
export class LogModule {}
