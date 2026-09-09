import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { TaskService } from './task.service'

@Injectable()
export class SystemTaskBootstrap implements OnModuleInit {
  private readonly logger = new Logger(SystemTaskBootstrap.name)

  constructor(private readonly taskService: TaskService) {}

  async onModuleInit() {
    await this.taskService.syncSystemTasks()
    this.logger.log('系统内置任务注册完成')
  }
}
