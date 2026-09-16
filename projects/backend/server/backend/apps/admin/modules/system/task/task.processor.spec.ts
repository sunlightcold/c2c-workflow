import { ExecuteEnum } from '@/common/interfaces'
import { SysTaskSource } from '@/apps/admin/database'
import { Logger } from '@nestjs/common'
import { TaskConsumer } from './task.processor'

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

describe('TaskConsumer logging', () => {
  const taskService = {
    findOne: jest.fn(),
    callTask: jest.fn(),
  }
  const taskLogService = { create: jest.fn() }
  let consumer: TaskConsumer

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    jest.spyOn(Logger.prototype, 'debug').mockImplementation()
    taskService.findOne.mockResolvedValue({
      id: 'task-1',
      name: '自动回查支付结果',
      service: 'C2cAutomationJob.recoverPayments',
      source: SysTaskSource.System,
    })
    taskLogService.create.mockResolvedValue(undefined)
    consumer = new TaskConsumer(taskService as never, taskLogService as never)
  })

  function job() {
    const value = {
      data: { id: 'task-1', service: 'C2cAutomationJob.recoverPayments' },
    }
    return value as never
  }

  it('allows recurring system jobs to progress when one worker is waiting on upstream I/O', () => {
    expect(Reflect.getMetadata('bullmq:worker_metadata', TaskConsumer)).toEqual({ concurrency: 8 })
  })

  it('keeps an empty recurring system task out of info logs', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    taskService.callTask.mockResolvedValue({
      payments: { found: 0, succeeded: 0, failed: 0 },
      batches: { found: 0, succeeded: 0, failed: 0 },
    })

    await expect(consumer.process(job())).resolves.toBe(true)

    expect(info).not.toHaveBeenCalled()
    expect(taskLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ExecuteEnum.Success }),
    )
  })

  it('logs one completion summary when a recurring task handles work', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    taskService.callTask.mockResolvedValue({
      payments: { found: 1, succeeded: 1, failed: 0 },
      batches: { found: 0, succeeded: 0, failed: 0 },
    })

    await consumer.process(job())

    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('任务执行完成'))
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"found":1'))
  })

  it('logs one application error summary when task execution fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    taskService.callTask.mockRejectedValue(new Error('upstream timeout'))

    await expect(consumer.process(job())).resolves.toBe(false)

    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('upstream timeout'))
    expect(taskLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ExecuteEnum.Fail }),
    )
  })
})
