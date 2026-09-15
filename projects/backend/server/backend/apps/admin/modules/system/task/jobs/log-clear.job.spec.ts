/// <reference types="jest" />

import { LogClearJob, TASK_LOG_RETENTION_MS } from './log-clear.job'

describe('LogClearJob', () => {
  afterEach(() => jest.useRealTimers())

  it('removes task logs older than two days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T04:00:00.000Z'))
    const logService = { clear: jest.fn() }
    const taskLogService = { clearBefore: jest.fn().mockResolvedValue(3) }
    const job = new LogClearJob(logService as any, taskLogService as any)

    const result = await job.clearTaskLog()

    expect(TASK_LOG_RETENTION_MS).toBe(172_800_000)
    expect(taskLogService.clearBefore).toHaveBeenCalledWith(new Date('2026-09-13T04:00:00.000Z'))
    expect(result).toEqual({ cutoff: '2026-09-13T04:00:00.000Z', deleted: 3 })
  })
})
