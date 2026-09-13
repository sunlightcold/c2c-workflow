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
    TASK_SYSTEM_LOCKED: '1303:系统任务不允许手动配置',
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
  CLIENT_ERROR_CLEANUP_CRON,
  EXPIRED_ADMIN_TOKEN_CLEANUP_CRON,
  SYSTEM_TASKS,
  SYSTEM_TASK_SERVICES,
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
    taskRepository = {
      save: jest.fn().mockResolvedValue({ id: 'task-1', status: 0 }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      findOneBy: jest.fn().mockResolvedValue({ id: 'task-1', source: 'custom', status: 1 }),
      createQueryBuilder: jest.fn(),
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

  it('rejects manual configuration of system task services', async () => {
    const dto: Parameters<TaskService['create']>[0] = {
      name: 'sys',
      service: 'SystemMaintenanceJob.clearExpiredAdminTokenSessions',
      type: SysTaskTypeEnum.Cron,
      status: SysTaskStatus.Disabled,
    }

    await expect(service.create(dto)).rejects.toThrow('1303:系统任务不允许手动配置')
  })

  it('syncs system tasks into the task repository', async () => {
    taskRepository.save.mockResolvedValueOnce({ id: SYSTEM_TASKS[0].id, status: 1 })
    taskRepository.findOneBy.mockResolvedValueOnce({
      id: SYSTEM_TASKS[0].id,
      source: 'system',
      status: 1,
    })

    await service.syncSystemTasks()

    expect(taskInvoker.checkService).toHaveBeenCalledWith(
      'SystemMaintenanceJob.clearExpiredAdminTokenSessions',
    )
    expect(taskInvoker.checkService).toHaveBeenCalledWith(
      'SystemMaintenanceJob.clearExpiredClientErrors',
    )
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

  it('registers client error cleanup to run every day', () => {
    expect(SYSTEM_TASKS[1]).toMatchObject({
      name: '清理过期客户端错误',
      service: 'SystemMaintenanceJob.clearExpiredClientErrors',
      type: SysTaskTypeEnum.Cron,
      cron: CLIENT_ERROR_CLEANUP_CRON,
    })
    expect(CLIENT_ERROR_CLEANUP_CRON).toBe('0 15 3 * * *')
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
