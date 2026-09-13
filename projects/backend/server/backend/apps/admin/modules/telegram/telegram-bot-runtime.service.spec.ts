import { BusinessStatus } from '@admin/database'
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service'

describe('TelegramBotRuntimeService', () => {
  const bot = {
    id: 'bot-1',
    tenantId: 'tenant-1',
    code: 'BOT_MAIN',
    status: BusinessStatus.ACTIVE,
    runtimeEnabled: true,
    tokenRef: 'enc://token',
  }
  const query = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(bot),
  }
  const bots = {
    createQueryBuilder: jest.fn().mockReturnValue(query),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  }
  const telegram = {
    deleteWebhook: jest.fn().mockResolvedValue(undefined),
    getMe: jest.fn().mockResolvedValue({ id: 1001, username: 'payment_bot' }),
    getUpdates: jest.fn(),
  }
  const inbox = { enqueue: jest.fn().mockResolvedValue({ accepted: true }) }

  beforeEach(() => jest.clearAllMocks())

  it('starts, reports online connectivity and stops a robot runtime', async () => {
    let releaseUpdates: (updates: never[]) => void = () => undefined
    telegram.getUpdates.mockImplementation(
      (_tokenRef: string, _offset: number | undefined, signal: AbortSignal) =>
        new Promise<never[]>((resolve) => {
          releaseUpdates = resolve
          signal.addEventListener('abort', () => resolve([]), { once: true })
        }),
    )
    const service = new TelegramBotRuntimeService(bots as never, telegram as never, inbox as never)

    expect(await service.start('tenant-1', 'bot-1')).toMatchObject({
      state: 'CONNECTING',
      runtimeRunning: true,
    })
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    expect(service.getStatus('BOT_MAIN')).toMatchObject({
      state: 'ONLINE',
      runtimeRunning: true,
      telegramUsername: 'payment_bot',
    })

    expect(await service.stop('tenant-1', 'bot-1')).toMatchObject({
      state: 'NOT_STARTED',
      runtimeRunning: false,
    })
    releaseUpdates([])
    expect(bots.update).toHaveBeenNthCalledWith(
      1,
      { id: 'bot-1', tenantId: 'tenant-1' },
      { runtimeEnabled: true },
    )
    expect(bots.update).toHaveBeenNthCalledWith(
      2,
      { id: 'bot-1', tenantId: 'tenant-1' },
      { runtimeEnabled: false },
    )
  })

  it('checks Telegram connectivity without starting the runtime', async () => {
    const service = new TelegramBotRuntimeService(bots as never, telegram as never, inbox as never)
    await expect(service.check('tenant-1', 'bot-1')).resolves.toMatchObject({
      state: 'ONLINE',
      runtimeRunning: false,
      telegramId: 1001,
    })
  })

  it('enqueues polled updates through the idempotent update inbox', async () => {
    telegram.getUpdates
      .mockResolvedValueOnce([{ update_id: 42, message: { text: '/status' } }])
      .mockImplementation(
        (_tokenRef: string, _offset: number | undefined, signal: AbortSignal) =>
          new Promise<never[]>((resolve) => {
            signal.addEventListener('abort', () => resolve([]), { once: true })
          }),
      )
    const service = new TelegramBotRuntimeService(bots as never, telegram as never, inbox as never)

    await service.start('tenant-1', 'bot-1')
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    expect(inbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bot-1', tenantId: 'tenant-1' }),
      expect.objectContaining({ update_id: 42 }),
    )
    await service.stop('tenant-1', 'bot-1')
  })

  it('cancels the current long poll before restarting the robot runtime', async () => {
    const signals: AbortSignal[] = []
    telegram.getUpdates.mockImplementation(
      (_tokenRef: string, _offset: number | undefined, signal: AbortSignal) => {
        signals.push(signal)
        return new Promise<never[]>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              resolve([])
            },
            { once: true },
          )
        })
      },
    )
    const service = new TelegramBotRuntimeService(bots as never, telegram as never, inbox as never)

    await service.start('tenant-1', 'bot-1')
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    await service.restart('tenant-1', 'bot-1')
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    await service.stop('tenant-1', 'bot-1')
  })
})
