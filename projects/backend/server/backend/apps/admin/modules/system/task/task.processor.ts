import { ExecuteEnum } from '@/common/interfaces'
import { safeStringify } from '@/common/utils'
import { SysTaskSource } from '@/apps/admin/database'
import {
  OnQueueEvent,
  Processor,
  QueueEventsHost,
  QueueEventsListener,
  WorkerHost,
} from '@nestjs/bullmq'
import { Logger, NotFoundException } from '@nestjs/common'
import { Job } from 'bullmq'
import { TaskLogService } from '../log'
import { TaskQueue } from './constant'
import { TaskService } from './task.service'
import { TaskJobData } from './type'

@Processor(TaskQueue.Task)
export class TaskConsumer extends WorkerHost {
  private readonly logger = new Logger(TaskConsumer.name)

  constructor(
    private readonly taskService: TaskService,
    private readonly taskLogService: TaskLogService,
  ) {
    super()
  }

  async process(job: Job<TaskJobData, boolean, TaskQueue.Task>): Promise<boolean> {
    const { service, data, id } = job.data
    const task = await this.taskService.findOne(id)
    const startedAt = Date.now()
    try {
      if (!task) {
        throw new NotFoundException(`任务${id}不存在`)
      }
      this.logger.log(`开始执行任务: ${task.name}, 路径：${task.service}`)
      const result = await this.taskService.callTask(service, data)
      const endedAt = Date.now()
      const time = endedAt - startedAt
      // 执行成功
      await this.taskLogService.create({
        taskId: id,
        taskName: task.name,
        taskSource: task.source ?? SysTaskSource.Custom,
        consumeTime: time,
        status: ExecuteEnum.Success,
        detail: safeStringify(result),
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
      })
      return Promise.resolve(true)
    } catch (error) {
      const endedAt = Date.now()
      const time = endedAt - startedAt
      // 执行失败
      await this.taskLogService.create({
        taskId: id,
        taskName: task?.name ?? `任务${id}不存在`,
        taskSource: task?.source ?? SysTaskSource.Custom,
        consumeTime: time,
        detail: `${error}`,
        status: ExecuteEnum.Fail,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
      })
      return Promise.resolve(false)
    }
  }

  @OnQueueEvent('completed')
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name} with data ${job.data}...`)
  }
}

@QueueEventsListener(TaskQueue.Task)
export class TaskQueueEvents extends QueueEventsHost {
  constructor(private readonly taskService: TaskService) {
    super()
  }

  @OnQueueEvent('completed')
  async onCompleted({ jobId }: { jobId: string; returnvalue: string; prev?: string }) {
    await this.taskService.updateTaskCompleteStatus(jobId)
  }
}
