/// <reference types="jest" />

jest.mock('@/common/constants', () => ({
  ErrorEnum: {
    INSECURE_TASK: '1301:不安全的任务，确保执行的加入@ScheduleTask注解',
    TASK_NOT_FOUND: '1302:任务不存在',
  },
}))

jest.mock('@/common/utils', () => ({
  isEmpty: jest.fn((value) => value === undefined || value === null || value === ''),
}))

import { ModuleRef, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { TaskInvokerService } from './task-invoker.service'

describe('TaskInvokerService', () => {
  let moduleRef: { get: jest.Mock }
  let reflector: { get: jest.Mock }
  let service: TaskInvokerService

  beforeEach(async () => {
    moduleRef = { get: jest.fn() }
    reflector = { get: jest.fn().mockReturnValue(true) }

    const module = await Test.createTestingModule({
      providers: [
        TaskInvokerService,
        {
          provide: ModuleRef,
          useValue: moduleRef,
        },
        {
          provide: Reflector,
          useValue: reflector,
        },
      ],
    }).compile()

    service = module.get(TaskInvokerService)
  })

  it('validates the target task service before invoking it', async () => {
    const handler = jest.fn().mockResolvedValue({ ok: true })
    moduleRef.get.mockReturnValue({
      handle: handler,
      constructor: class HttpRequestJob {},
    })

    await expect(service.callTask('HttpRequestJob.handle', '{"id":1}')).resolves.toEqual({
      ok: true,
    })

    expect(handler).toHaveBeenCalledWith({ id: 1 })
    expect(reflector.get).toHaveBeenCalled()
  })

  it('rejects services without ScheduleTask metadata', async () => {
    moduleRef.get.mockReturnValue({
      handle: jest.fn(),
      constructor: class UnsafeJob {},
    })
    reflector.get.mockReturnValue(false)

    expect(() => service.checkService('UnsafeJob.handle')).toThrow(
      '1301:不安全的任务，确保执行的加入@ScheduleTask注解',
    )
  })
})
