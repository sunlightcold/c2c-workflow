/// <reference types="jest" />

jest.mock('@/apps/admin/database', () => ({
  SysTaskEntity: class MockSysTaskEntity {},
  SysTaskSource: {
    Custom: 'custom',
    System: 'system',
  },
  SysTaskStatus: {
    Activated: 1,
    Disabled: 0,
  },
  SysTaskTypeEnum: {
    Cron: 'Cron',
    Interval: 'Interval',
  },
}))

jest.mock('@/common/constants', () => ({
  ErrorEnum: {
    INSECURE_TASK: '1301:不安全的任务，确保执行的加入@ScheduleTask注解',
    TASK_NOT_FOUND: '1302:任务不存在',
    TASK_SYSTEM_DELETE_FORBIDDEN: '1303:系统任务不允许删除',
    TASK_SYSTEM_SERVICE_RESERVED: '1304:系统任务服务不能用于自定义任务',
  },
}))

jest.mock('@/common/dto', () => ({
  toPaginationParams: jest.fn((data) => ({
    paginateOptions: { limit: data.pageSize, page: data.pageIndex },
    params: data,
  })),
}))

jest.mock('@/common/utils', () => ({
  isEmpty: jest.fn().mockReturnValue(false),
}))

jest.mock('nestjs-typeorm-paginate', () => ({
  paginate: jest.fn().mockResolvedValue({ items: [], meta: {} }),
}))

import { SysTaskEntity, SysTaskStatus, SysTaskTypeEnum } from '@/apps/admin/database'
import { getQueueToken } from '@nestjs/bullmq'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TaskQueue } from './constant'
import {
  EXPIRED_ADMIN_TOKEN_CLEANUP_CRON,
  SYSTEM_TASKS,
  SYSTEM_TASK_SERVICES,
  TASK_LOG_CLEANUP_CRON,
} from './system-task.registry'
import { TaskInvokerService } from './task-invoker.service'
import { TaskService } from './task.service'

describe('TaskService', () => {
  let taskRepository: {
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    findOneBy: jest.Mock
    createQueryBuilder: jest.Mock
    existsBy: jest.Mock
  }
  let taskQueryBuilder: {
    andWhere: jest.Mock
    orderBy: jest.Mock
    addOrderBy: jest.Mock
  }
  let taskQueue: {
    add: jest.Mock
    removeJobScheduler: jest.Mock
    getJobs: jest.Mock
    trimEvents: jest.Mock
    getJobSchedulers: jest.Mock
    getJobScheduler: jest.Mock
  }
  let taskInvoker: {
    checkService: jest.Mock
    checkServiceMeta: jest.Mock
    callTask: jest.Mock
  }
  let service: TaskService

  beforeEach(async () => {
    taskQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
    }
    taskRepository = {
      save: jest.fn().mockResolvedValue({ id: 'task-1', status: 0 }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      findOneBy: jest.fn().mockResolvedValue({ id: 'task-1', source: 'custom', status: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(taskQueryBuilder),
      existsBy: jest.fn().mockResolvedValue(true),
    }
    taskQueue = {
      add: jest.fn().mockResolvedValue({ opts: { repeat: {} } }),
      removeJobScheduler: jest.fn().mockResolvedValue(undefined),
      getJobs: jest.fn().mockResolvedValue([]),
      trimEvents: jest.fn().mockResolvedValue(undefined),
      getJobSchedulers: jest.fn().mockResolvedValue([]),
      getJobScheduler: jest.fn().mockResolvedValue(null),
    }
    taskInvoker = {
      checkService: jest.fn(),
      checkServiceMeta: jest.fn(),
      callTask: jest.fn(),
    }

    const module = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: getQueueToken(TaskQueue.Task),
          useValue: taskQueue,
        },
        {
          provide: getRepositoryToken(SysTaskEntity),
          useValue: taskRepository,
        },
        {
          provide: TaskInvokerService,
          useValue: taskInvoker,
        },
      ],
    }).compile()

    service = module.get(TaskService)
  })

  it('marks created tasks as custom source', async () => {
    const dto: Parameters<TaskService['create']>[0] = {
      name: 'cleanup',
      service: 'HttpRequestJob.handle',
      type: SysTaskTypeEnum.Cron,
      status: SysTaskStatus.Disabled,
    }

    await service.create(dto)

    expect(taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({ source: 'custom' }))
  })

  it('returns tasks in a stable creation order', async () => {
    await service.filter({ pageIndex: 1, pageSize: 20 } as any)

    expect(taskRepository.createQueryBuilder).toHaveBeenCalledWith('task')
    expect(taskQueryBuilder.orderBy).toHaveBeenCalledWith('task.createdAt', 'ASC')
    expect(taskQueryBuilder.addOrderBy).toHaveBeenCalledWith('task.id', 'ASC')
  })

  it('keeps a recurring task active when its next occurrence is overdue', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000)
    const task = {
      id: 'task-1',
      status: SysTaskStatus.Activated,
      type: SysTaskTypeEnum.Interval,
      every: 5_000,
    }
    taskQueue.getJobScheduler.mockResolvedValue({ key: task.id })
    taskQueue.getJobSchedulers.mockResolvedValue([{ key: task.id, next: 9_000 }])
    taskRepository.findOneBy.mockResolvedValue(task)

    await service.updateTaskCompleteStatus(`repeat:${task.id}:9000`)

    expect(taskQueue.getJobScheduler).toHaveBeenCalledWith(task.id)
    expect(taskRepository.findOneBy).toHaveBeenCalledWith({ id: task.id })
    expect(taskQueue.removeJobScheduler).not.toHaveBeenCalled()
    expect(taskRepository.update).not.toHaveBeenCalledWith(task.id, {
      status: SysTaskStatus.Disabled,
    })
  })

  it('disables a finite recurring task after its execution limit is reached', async () => {
    const task = {
      id: 'task-1',
      status: SysTaskStatus.Activated,
      type: SysTaskTypeEnum.Interval,
      every: 5_000,
      limit: 2,
    }
    const scheduler = {
      key: task.id,
      iterationCount: 2,
      limit: 2,
      next: 9_000,
    }
    taskQueue.getJobScheduler.mockResolvedValue(scheduler)
    taskQueue.getJobSchedulers.mockResolvedValue([scheduler])
    taskRepository.findOneBy.mockResolvedValue(task)

    await service.updateTaskCompleteStatus(`repeat:${task.id}:9000`)

    expect(taskQueue.removeJobScheduler).toHaveBeenCalledWith(task.id)
    expect(taskRepository.update).toHaveBeenCalledWith(task.id, {
      status: SysTaskStatus.Disabled,
    })
  })

  it('does not persist a disabled state while rescheduling an active task', async () => {
    const task = {
      id: 'task-1',
      service: 'HttpRequestJob.handle',
      status: SysTaskStatus.Activated,
      type: SysTaskTypeEnum.Interval,
      every: 5_000,
      limit: -1,
    }
    taskQueue.getJobSchedulers.mockResolvedValue([{ key: task.id }])

    await service.start(task as SysTaskEntity)

    expect(taskQueue.removeJobScheduler).toHaveBeenCalledWith(task.id)
    expect(taskRepository.update).not.toHaveBeenCalledWith(task.id, {
      status: SysTaskStatus.Disabled,
    })
  })

  it('preserves the configured active state when scheduling fails', async () => {
    const task = {
      id: 'task-1',
      service: 'HttpRequestJob.handle',
      status: SysTaskStatus.Activated,
      type: SysTaskTypeEnum.Interval,
      every: 5_000,
      limit: -1,
    }
    taskQueue.add.mockResolvedValue(undefined)

    await expect(service.start(task as SysTaskEntity)).rejects.toThrow('Task Start failed')

    expect(taskRepository.update).not.toHaveBeenCalledWith(task.id, {
      status: SysTaskStatus.Disabled,
    })
  })

  it('rejects manual configuration of system task services', async () => {
    const dto: Parameters<TaskService['create']>[0] = {
      name: 'sys',
      service: 'SystemMaintenanceJob.clearExpiredAdminTokenSessions',
      type: SysTaskTypeEnum.Cron,
      status: SysTaskStatus.Disabled,
    }

    await expect(service.create(dto)).rejects.toThrow('1304:系统任务服务不能用于自定义任务')
  })

  it('allows a system task to run once', async () => {
    const task = {
      id: SYSTEM_TASKS[0].id,
      source: 'system',
      service: SYSTEM_TASKS[0].service,
      data: '',
    }

    await expect(service.once(task as SysTaskEntity)).resolves.toBeUndefined()

    expect(taskQueue.add).toHaveBeenCalledWith(
      TaskQueue.Task,
      expect.objectContaining({ id: task.id, service: task.service }),
      expect.objectContaining({ jobId: task.id }),
    )
  })

  it('allows starting and stopping a system task', async () => {
    const task = {
      id: SYSTEM_TASKS[0].id,
      source: 'system',
      service: SYSTEM_TASKS[0].service,
      type: SysTaskTypeEnum.Cron,
      status: SysTaskStatus.Disabled,
      cron: SYSTEM_TASKS[0].cron,
      limit: -1,
    }
    taskQueue.getJobSchedulers.mockResolvedValue([])

    await expect(service.start(task as SysTaskEntity)).resolves.toBeUndefined()
    taskQueue.getJobSchedulers.mockResolvedValue([{ key: task.id }])
    const stoppedTask = Object.assign(new SysTaskEntity(), task, {
      status: SysTaskStatus.Activated,
    })
    await expect(service.stop(stoppedTask)).resolves.toBeUndefined()

    expect(taskQueue.add).toHaveBeenCalled()
    expect(taskRepository.update).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ status: SysTaskStatus.Disabled }),
    )
  })

  it('updates all editable system task fields including service and data', async () => {
    const task = {
      id: SYSTEM_TASKS[0].id,
      source: 'system',
      service: SYSTEM_TASKS[0].service,
      status: SysTaskStatus.Disabled,
      type: SysTaskTypeEnum.Cron,
      cron: SYSTEM_TASKS[0].cron,
      limit: -1,
    }
    taskRepository.findOneBy.mockResolvedValueOnce(task).mockResolvedValueOnce({
      ...task,
      name: '自定义清理',
      cron: '0 1 * * * *',
      service: 'OtherJob.handle',
      data: '{"retentionDays":30}',
    })

    await service.update(task.id, {
      name: '自定义清理',
      cron: '0 1 * * * *',
      service: 'OtherJob.handle',
      data: '{"retentionDays":30}',
      status: SysTaskStatus.Disabled,
    })

    expect(taskRepository.update).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        name: '自定义清理',
        cron: '0 1 * * * *',
        service: 'OtherJob.handle',
        data: '{"retentionDays":30}',
      }),
    )
  })

  it('does not delete a system task', async () => {
    taskRepository.findOneBy.mockResolvedValue({
      id: SYSTEM_TASKS[0].id,
      source: 'system',
      status: SysTaskStatus.Disabled,
    })

    await expect(service.delete(SYSTEM_TASKS[0].id)).rejects.toThrow('1303:系统任务不允许删除')
    expect(taskRepository.delete).not.toHaveBeenCalled()
  })

  it('preserves all operator edits when syncing existing system tasks', async () => {
    const task = {
      ...SYSTEM_TASKS[0],
      source: 'system',
      name: '运营调整后的名称',
      service: 'OtherJob.handle',
      data: '{"retentionDays":30}',
      cron: '0 1 * * * *',
      status: SysTaskStatus.Disabled,
    }
    taskRepository.findOneBy.mockResolvedValue(task)

    await service.syncSystemTasks()

    expect(taskRepository.save).not.toHaveBeenCalled()
    expect(taskRepository.update).not.toHaveBeenCalledWith(task.id, { source: 'system' })
    expect(taskRepository.update).not.toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ service: SYSTEM_TASKS[0].service }),
    )
    expect(taskInvoker.checkService).toHaveBeenCalledWith('OtherJob.handle')
    expect(taskQueue.add).not.toHaveBeenCalled()
  })

  it('syncs system tasks into the task repository', async () => {
    taskRepository.findOneBy.mockResolvedValue(null)
    taskRepository.save.mockImplementation(async (task) => task)

    await service.syncSystemTasks()

    expect(taskInvoker.checkService).toHaveBeenCalledWith(
      'SystemMaintenanceJob.clearExpiredAdminTokenSessions',
    )
    expect(taskInvoker.checkService).toHaveBeenCalledWith('LogClearJob.clearTaskLog')
    expect(taskInvoker.checkService).toHaveBeenCalledWith('C2cAutomationJob.syncDueOrders')
    expect(taskInvoker.checkService).toHaveBeenCalledWith(
      'C2cAutomationJob.processAutomaticPayments',
    )
    expect(taskInvoker.checkService).toHaveBeenCalledWith('C2cAutomationJob.recoverPayments')
    expect(taskRepository.save).toHaveBeenCalledTimes(SYSTEM_TASKS.length)
    expect(taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({ source: 'system' }))
    expect(SYSTEM_TASK_SERVICES.has('SystemMaintenanceJob')).toBe(true)
  })

  it('registers expired token cleanup to run every 12 hours', () => {
    expect(SYSTEM_TASKS[0]).toMatchObject({
      name: '清理过期Token',
      type: SysTaskTypeEnum.Cron,
      cron: EXPIRED_ADMIN_TOKEN_CLEANUP_CRON,
    })
    expect(EXPIRED_ADMIN_TOKEN_CLEANUP_CRON).toBe('0 0 */12 * * *')
  })

  it('registers task log cleanup to run daily at 04:00', () => {
    expect(SYSTEM_TASKS).toContainEqual(
      expect.objectContaining({
        name: '清理过期任务日志',
        service: 'LogClearJob.clearTaskLog',
        type: SysTaskTypeEnum.Cron,
        status: SysTaskStatus.Activated,
        cron: TASK_LOG_CLEANUP_CRON,
      }),
    )
    expect(TASK_LOG_CLEANUP_CRON).toBe('0 0 4 * * *')
  })

  it('does not remove locked active jobs when stopping an existing schedule', async () => {
    const task = {
      id: '00000000-0000-4000-8000-000000000101',
      source: 'custom',
      status: SysTaskStatus.Activated,
    }
    const activeJob = {
      data: { id: task.id },
      remove: jest
        .fn()
        .mockRejectedValue(
          new Error(
            `Job repeat:${task.id}:1779375000000 could not be removed because it is locked by another worker`,
          ),
        ),
    }

    taskQueue.getJobSchedulers.mockResolvedValue([{ key: task.id }])
    taskQueue.getJobs.mockImplementation((types: string[]) =>
      Promise.resolve(types.includes('active') ? [activeJob] : []),
    )

    await expect(service.stop(task as SysTaskEntity)).resolves.toBeUndefined()

    expect(taskQueue.removeJobScheduler).toHaveBeenCalledWith(task.id)
    expect(taskQueue.getJobs).toHaveBeenCalledWith([
      'delayed',
      'failed',
      'paused',
      'waiting',
      'completed',
    ])
    expect(activeJob.remove).not.toHaveBeenCalled()
    expect(taskRepository.update).toHaveBeenCalledWith(task.id, { status: SysTaskStatus.Disabled })
  })
})
