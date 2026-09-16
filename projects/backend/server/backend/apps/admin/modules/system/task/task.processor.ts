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

@Processor(TaskQueue.Task, { concurrency: 8 })
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
      this.logger.debug(`任务开始: name=${task.name}, service=${task.service}`)
      const result = await this.taskService.callTask(service, data)
      const endedAt = Date.now()
      const time = endedAt - startedAt
      const detail = safeStringify(result)
      // 执行成功
      await this.taskLogService.create({
        taskId: id,
        taskName: task.name,
        taskSource: task.source ?? SysTaskSource.Custom,
        consumeTime: time,
        status: ExecuteEnum.Success,
        detail,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
      })
      const summary = taskResultSummary(result)
      if (task.source !== SysTaskSource.System || hasMeaningfulActivity(summary)) {
        this.logger.log(
          `任务执行完成: name=${task.name}, service=${task.service}, durationMs=${time}${summary ? `, result=${safeStringify(summary)}` : ''}`,
        )
      }
      return Promise.resolve(true)
    } catch (error) {
      const endedAt = Date.now()
      const time = endedAt - startedAt
      this.logger.error(
        `任务执行失败: name=${task?.name ?? id}, service=${service}, durationMs=${time}, error=${errorMessage(error)}`,
      )
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
}

function hasMeaningfulActivity(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some((item) => hasMeaningfulActivity(item))
}

function taskResultSummary(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return { count: value.length }
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const summary = taskResultSummary(item)
    return summary === undefined ? [] : [[key, summary] as const]
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 512)
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
