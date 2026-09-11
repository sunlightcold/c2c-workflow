import { TelegramUpdateStatus } from '@admin/database'
import { TelegramUpdateProcessorService } from './telegram-update-processor.service'

describe('TelegramUpdateProcessorService', () => {
  const event = {
    id: 'update-1',
    botId: 'bot-1',
    tenantId: 'tenant-1',
    updateId: '123',
    payload: { update_id: 123 },
    status: TelegramUpdateStatus.PROCESSING,
  }

  it('marks a claimed update completed after runtime handling', async () => {
    const dataSource = {}
    const runtime = { handle: jest.fn().mockResolvedValue(undefined) }
    const processor = new TelegramUpdateProcessorService(dataSource as never, runtime as never)
    jest.spyOn(processor, 'claimNext').mockResolvedValue(event as never)
    jest.spyOn(processor, 'finish').mockResolvedValue(undefined)

    await expect(processor.processNext()).resolves.toBe(true)
    expect(runtime.handle).toHaveBeenCalledWith(event)
    expect(processor.finish).toHaveBeenCalledWith('update-1', TelegramUpdateStatus.COMPLETED, null)
  })

  it('records a sanitized failure and keeps the polling loop alive', async () => {
    const dataSource = {}
    const runtime = { handle: jest.fn().mockRejectedValue(new Error('request failed')) }
    const processor = new TelegramUpdateProcessorService(dataSource as never, runtime as never)
    jest.spyOn(processor, 'claimNext').mockResolvedValue(event as never)
    jest.spyOn(processor, 'finish').mockResolvedValue(undefined)

    await expect(processor.processNext()).resolves.toBe(true)
    expect(processor.finish).toHaveBeenCalledWith(
      'update-1',
      TelegramUpdateStatus.FAILED,
      'request failed',
    )
  })
})
