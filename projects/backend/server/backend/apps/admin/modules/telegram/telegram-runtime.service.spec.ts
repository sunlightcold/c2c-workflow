import { TelegramCapability } from './telegram-policy'
import { TelegramRuntimeService } from './telegram-runtime.service'

describe('TelegramRuntimeService', () => {
  const bot = {
    id: 'bot-1',
    code: 'PAY_MAIN',
    tenantId: 'tenant-1',
    tokenRef: 'env://TG_TOKEN',
    capabilities: [TelegramCapability.ORDER_QUERY],
  }
  const botQuery = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(bot),
  }
  const bots = { createQueryBuilder: jest.fn().mockReturnValue(botQuery) }
  const authorization = {
    authorize: jest.fn().mockResolvedValue({
      allowed: true,
      capabilities: [TelegramCapability.ORDER_QUERY],
    }),
  }
  const telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) }
  const manualPayments = { prepare: jest.fn(), confirm: jest.fn(), cancel: jest.fn() }
  const batchPayments = { prepare: jest.fn(), confirm: jest.fn(), cancel: jest.fn() }
  const queries = { query: jest.fn(), todayStats: jest.fn(), status: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('replies with the Telegram user ID without requiring a group binding', async () => {
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 9,
          chat: { id: -1001, type: 'supergroup' },
          from: { id: 88 },
          text: '/myid',
        },
      },
    })

    expect(authorization.authorize).not.toHaveBeenCalled()
    expect(telegram.sendMessage).toHaveBeenCalledWith({
      tokenRef: 'env://TG_TOKEN',
      chatId: '-1001',
      replyToMessageId: 9,
      text: '您的 Telegram 用户编号：88',
    })
  })

  it('shows only commands enabled by final authorization', async () => {
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 10,
          chat: { id: -1001, type: 'supergroup' },
          from: { id: 88 },
          text: '/help@payment_bot',
        },
      },
    })

    const reply = telegram.sendMessage.mock.calls[0]?.[0]
    expect(reply.text).toContain('/query')
    expect(reply.text).toContain('/myid')
    expect(reply.text).not.toContain('/balance')
    expect(reply.text).not.toContain('/submitbatch')
  })

  it('turns a four-line message into a confirmation reply', async () => {
    manualPayments.prepare.mockResolvedValue({
      text: '待确认 1 笔',
      replyMarkup: {
        inline_keyboard: [[{ text: '确认下单', callback_data: 'payment:confirm:interaction-1' }]],
      },
    })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )
    const text = 'ORDER-1\n100.50\n张三\n13800138000'

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 11,
          chat: { id: -1001, type: 'supergroup' },
          from: { id: 88 },
          text,
        },
      },
    })

    expect(manualPayments.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        bot,
        text,
        message: { chatId: '-1001', messageId: 11, text, userId: '88' },
      }),
    )
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '待确认 1 笔',
        replyMarkup: expect.any(Object),
      }),
    )
  })

  it('reauthorizes a callback before confirming a payment interaction', async () => {
    const interactionId = '00000000-0000-4000-8000-000000000050'
    manualPayments.confirm.mockResolvedValue({ text: '已创建 1 笔支付订单' })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        callback_query: {
          data: `payment:confirm:${interactionId}`,
          from: { id: 88 },
          message: { message_id: 12, chat: { id: -1001, type: 'supergroup' } },
        },
      },
    })

    expect(authorization.authorize).toHaveBeenCalledWith(bot, '-1001', '88')
    expect(manualPayments.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ interactionId, bot }),
    )
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: '已创建 1 笔支付订单' }),
    )
  })

  it('runs an order query inside the authorized merchant scope', async () => {
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.ORDER_QUERY],
      group: { merchantId: 'merchant-1' },
    })
    queries.query.mockResolvedValue('支付单号：PAY001')
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: { message_id: 13, chat: { id: -1001 }, from: { id: 88 }, text: '/query PAY001' },
      },
    })

    expect(queries.query).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'PAY001')
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: '支付单号：PAY001' }),
    )
  })

  it('returns merchant-scoped payment statistics', async () => {
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.PAYMENT_STATISTICS],
      group: { merchantId: 'merchant-1' },
    })
    queries.todayStats.mockResolvedValue('今日支付统计')
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: { message_id: 14, chat: { id: -1001 }, from: { id: 88 }, text: '/stats' },
      },
    })

    expect(queries.todayStats).toHaveBeenCalledWith('tenant-1', 'merchant-1')
  })

  it('returns the authorized bot and group status', async () => {
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.BOT_STATUS_MANAGE],
      group: { merchantId: 'merchant-1', name: '支付一群' },
    })
    queries.status.mockReturnValue('机器人：PAY_MAIN')
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: { message_id: 15, chat: { id: -1001 }, from: { id: 88 }, text: '/status' },
      },
    })

    expect(queries.status).toHaveBeenCalledWith('PAY_MAIN', '支付一群')
  })

  it('creates a confirmation intent for submitbatch', async () => {
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.PAYMENT_BATCH_SUBMIT],
      group: { merchantId: 'merchant-1' },
    })
    batchPayments.prepare.mockResolvedValue({
      text: '待确认 2 笔，分为 1 个支付批次',
      replyMarkup: { inline_keyboard: [] },
    })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 16,
          chat: { id: -1001 },
          from: { id: 88 },
          text: '/submitbatch',
        },
      },
    })

    expect(batchPayments.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ bot, message: expect.objectContaining({ messageId: 16 }) }),
    )
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ replyMarkup: { inline_keyboard: [] } }),
    )
  })

  it('reauthorizes a batch callback before submission', async () => {
    const interactionId = '00000000-0000-4000-8000-000000000060'
    batchPayments.confirm.mockResolvedValue({ text: '已提交 1 个支付批次' })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        callback_query: {
          data: `batch:confirm:${interactionId}`,
          from: { id: 88 },
          message: { message_id: 14, chat: { id: -1001 } },
        },
      },
    })

    expect(authorization.authorize).toHaveBeenCalledWith(bot, '-1001', '88')
    expect(batchPayments.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ interactionId, bot }),
    )
  })
})
