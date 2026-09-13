import { BullModule } from '@nestjs/bullmq'
import { Module, Provider } from '@nestjs/common'
import { ClientErrorModule } from '../../client-error'
import { C2cOrderModule } from '../../c2c-order'
import { PaymentModule } from '../../payment'
import { LogModule } from '../log'
import { TaskQueue } from './constant'
import { C2cAutomationJob, HttpRequestJob, LogClearJob, SystemMaintenanceJob } from './jobs'
import { SystemTaskBootstrap } from './system-task.bootstrap'
import { TaskController } from './task.controller'
import { TaskInvokerService } from './task-invoker.service'
import { TaskConsumer, TaskQueueEvents } from './task.processor'
import { TaskService } from './task.service'

const jobServices = [C2cAutomationJob, HttpRequestJob, LogClearJob, SystemMaintenanceJob]

/**
 * 创建别名后可以使用别名通过 ModuleRef.get 的方式获取 service 实例，否则无法获取
 * 例如 ModuleRef.get('HttpRequestJob')
 */
function getAliasProvider() {
  const providers: Provider[] = []
  for (const job of jobServices) {
    providers.push({ provide: job.name, useExisting: job })
  }
  return providers
}

@Module({
  imports: [
    LogModule,
    ClientErrorModule,
    C2cOrderModule,
    PaymentModule,
    BullModule.registerQueue({
      name: TaskQueue.Task,
    }),
  ],
  controllers: [TaskController],
  providers: [
    TaskInvokerService,
    TaskService,
    SystemTaskBootstrap,
    TaskQueueEvents,
    TaskConsumer,
    ...jobServices,
    ...getAliasProvider(),
  ],
  exports: [TaskService],
})
export class TaskModule {}
