import { SysTaskEntity, SysTaskSource, SysTaskStatus, SysTaskTypeEnum } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { toPaginationParams } from '@/common/dto'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue, RepeatOptions } from 'bullmq'
import { isNotEmpty } from 'class-validator'
import { paginate } from 'nestjs-typeorm-paginate'
import { Like, Repository } from 'typeorm'
import { TaskQueue } from './constant'
import { TaskCreateDto, TaskFilterDto, TaskUpdateDto } from './dto'
import { SYSTEM_TASKS, SYSTEM_TASK_SERVICES, SystemTaskDefinition } from './system-task.registry'
import { TaskInvokerService } from './task-invoker.service'
import { TaskJobData } from './type'

@Injectable()
export class TaskService {
  constructor(
    @InjectQueue(TaskQueue.Task) private readonly taskQueue: Queue<TaskJobData>,
    @InjectRepository(SysTaskEntity)
    private readonly taskRepository: Repository<SysTaskEntity>,
    private readonly taskInvoker: TaskInvokerService,
  ) {}

  async create(dto: TaskCreateDto) {
    this.assertCustomTaskService(dto.service)
    const task = await this.taskRepository.save({ ...dto, source: SysTaskSource.Custom })
    if (task.status === SysTaskStatus.Activated) {
      await this.start(task)
    }
  }

  async update(id: string, dto: TaskUpdateDto) {
    const currentTask = await this.findOne(id)
    if (currentTask.source === SysTaskSource.Custom && dto.service) {
      this.assertCustomTaskService(dto.service)
    }
    await this.taskRepository.update(id, dto)

    const task = (await this.taskRepository.findOneBy({ id }))!
    if (task.status === SysTaskStatus.Activated) {
      await this.start(task)
    } else {
      await this.stop(task)
    }
  }

  async delete(id: string) {
    const task = await this.taskRepository.findOneBy({ id })
    if (!task) {
      throw new NotFoundException(`任务${id}不存在`)
    } else {
      this.assertCustomTask(task)
      await this.stop(task)
      await this.taskRepository.delete(id)
    }
  }

  async findOne(id: string) {
    const task = await this.taskRepository.findOneBy({ id })
    if (task) {
      return task
    }
    throw new NotFoundException(`任务${id}不存在`)
  }

  filter(dto: TaskFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { name, status, type, description, source } = params
    return paginate(
      this.taskRepository
        .createQueryBuilder('task')
        .andWhere({
          ...(name ? { name: Like(`%${name}%`) } : null),
          ...(description ? { description: Like(`%${description}%`) } : null),
          ...(isNotEmpty(status) ? { status } : null),
          ...(isNotEmpty(type) ? { type } : null),
          ...(source ? { source } : null),
        })
        .orderBy('task.createdAt', 'ASC')
        .addOrderBy('task.id', 'ASC'),
      paginateOptions,
    )
  }

  async start(task: SysTaskEntity) {
    await this.startInternal(task)
  }

  /**
   * 手动执行一次
   */
  async once(task?: SysTaskEntity): Promise<void> {
    if (task) {
      await this.taskQueue.add(
        TaskQueue.Task,
        { id: task.id, service: task.service, data: task.data },
        { jobId: task.id, removeOnComplete: true, removeOnFail: true },
      )
    } else {
      throw new BadRequestException(ErrorEnum.TASK_NOT_FOUND)
    }
  }

  /**
   * 停止任务
   */
  async stop(task: SysTaskEntity) {
    await this.stopInternal(task)
  }

  /**
   * 查看队列中任务是否存在
   */
  async existJob(jobId: string): Promise<boolean> {
    const jobs = await this.taskQueue.getJobSchedulers()
    const ids = jobs.map((job) => job.key)
    return ids.includes(jobId)
  }

  /**
   * 执行任务
   */
  async callTask(name: string, data: string) {
    return this.taskInvoker.callTask(name, data)
  }

  /**
   * 检查任务注解和安全判断
   */
  checkServiceMeta(serviceName: string, methodName: string) {
    this.taskInvoker.checkServiceMeta(serviceName, methodName)
  }

  async syncSystemTasks() {
    for (const definition of SYSTEM_TASKS) {
      const task = await this.upsertSystemTask(definition)
      this.checkTaskService(task.service)
      if (task.status === SysTaskStatus.Activated) {
        await this.startInternal(task)
      } else {
        await this.stopInternal(task)
      }
    }
  }

  /**
   * 每次任务完成时检查该任务队列是否已经结束并修改状态
   */
  async updateTaskCompleteStatus(jobId: string): Promise<void> {
    const taskId = this.getTaskIdFromJobId(jobId)
    const [schedule, task] = await Promise.all([
      this.taskQueue.getJobScheduler(taskId),
      this.taskRepository.findOneBy({ id: taskId }),
    ])
    if (!schedule || !task) return

    const reachedLimit =
      typeof schedule.limit === 'number' &&
      schedule.limit > 0 &&
      typeof schedule.iterationCount === 'number' &&
      schedule.iterationCount >= schedule.limit
    const reachedEnd =
      typeof schedule.endDate === 'number' &&
      (typeof schedule.next !== 'number' || schedule.next <= Date.now())

    if (reachedLimit || reachedEnd) {
      await this.stopInternal(task)
    }
  }

  private async startInternal(task: SysTaskEntity) {
    if (!task) throw new BadRequestException(ErrorEnum.TASK_NOT_FOUND)

    const jobId = task.id

    // Replacing a schedule is not a user stop action and must not change persisted status.
    await this.removeSchedule(task.id)

    const repeat: RepeatOptions = { tz: 'Asia/Shanghai', key: jobId }
    if (task.type === SysTaskTypeEnum.Cron) {
      repeat.pattern = task.cron
      if (task.startedAt) repeat.startDate = task.startedAt
      if (task.endedAt) repeat.endDate = task.endedAt
    } else if (task.type === SysTaskTypeEnum.Interval) {
      repeat.every = task.every
    }
    if (task.limit > 0) repeat.limit = task.limit

    const job = await this.taskQueue.add(
      TaskQueue.Task,
      { id: jobId, service: task.service, data: task.data },
      { jobId, removeOnComplete: true, removeOnFail: true, repeat },
    )

    if (!job?.opts) {
      await job?.remove()
      throw new BadRequestException('Task Start failed')
    }

    await this.taskRepository.update(task.id, {
      jobOpts: JSON.stringify(job.opts.repeat),
      status: SysTaskStatus.Activated,
    })
  }

  private checkTaskService(service: string) {
    this.taskInvoker.checkService(service)
  }

  private assertCustomTask(task: SysTaskEntity) {
    if (task.source === SysTaskSource.System) {
      throw new BadRequestException(ErrorEnum.TASK_SYSTEM_DELETE_FORBIDDEN)
    }
  }

  private assertCustomTaskService(service: string) {
    const [serviceName] = service.split('.')
    if (SYSTEM_TASK_SERVICES.has(serviceName)) {
      throw new BadRequestException(ErrorEnum.TASK_SYSTEM_SERVICE_RESERVED)
    }
  }

  private getTaskIdFromJobId(jobId: string) {
    if (!jobId.startsWith('repeat:')) return jobId
    const timestampSeparator = jobId.lastIndexOf(':')
    return jobId.slice('repeat:'.length, timestampSeparator)
  }

  private async upsertSystemTask(definition: SystemTaskDefinition) {
    const systemTask = {
      ...definition,
      data: definition.data ?? '',
      source: SysTaskSource.System,
    }
    const existing = await this.taskRepository.findOneBy({ id: definition.id })
    if (!existing) {
      return (await this.taskRepository.save(systemTask)) as SysTaskEntity
    }

    // Registry definitions seed new tasks; existing task settings remain operator-managed.
    if (existing.source !== SysTaskSource.System) {
      await this.taskRepository.update(definition.id, { source: SysTaskSource.System })
      existing.source = SysTaskSource.System
    }
    return existing
  }

  private async stopInternal(task: SysTaskEntity) {
    if (!task) throw new BadRequestException(ErrorEnum.TASK_NOT_FOUND)

    const jobId = task.id
    await this.removeSchedule(jobId)
    if (task.status === SysTaskStatus.Activated) {
      await this.taskRepository.update(task.id, { status: SysTaskStatus.Disabled })
    }
  }

  private async removeSchedule(jobId: string) {
    if (!(await this.existJob(jobId))) return

    // 从调度器中移除任务
    await this.taskQueue.removeJobScheduler(jobId)

    const jobs = await this.taskQueue.getJobs([
      'delayed',
      'failed',
      'paused',
      'waiting',
      'completed',
    ])
    for (const job of jobs.filter((j) => j.data.id === jobId)) {
      await job.remove()
    }

    // 控制事件流的大小，即控制 redis 中存储的 events 数量避免数据量过大
    await this.taskQueue.trimEvents(1000)
  }
}
