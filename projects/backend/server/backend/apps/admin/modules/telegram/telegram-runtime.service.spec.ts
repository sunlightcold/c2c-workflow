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
    canBindGroups: jest.fn().mockResolvedValue(false),
  }
  const telegram = {
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPhoto: jest.fn().mockResolvedValue(undefined),
  }
  const manualPayments = { prepare: jest.fn(), confirm: jest.fn(), cancel: jest.fn() }
  const batchPayments = { prepare: jest.fn(), confirm: jest.fn(), cancel: jest.fn() }
  const queries = {
    query: jest.fn(),
    receipt: jest.fn(),
    balance: jest.fn(),
    todayStats: jest.fn(),
    status: jest.fn(),
  }
  const groups = { bindByMerchant: jest.fn() }
  const c2cOrderActions = { confirm: jest.fn(), cancel: jest.fn() }
  const c2cAppeals = { prepare: jest.fn(), confirmReason: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    authorization.canBindGroups.mockResolvedValue(false)
  })

  it.each([
    ['confirm', '确认下单', 'C2C订单已创建'],
    ['cancel', '作废订单', 'C2C订单已作废'],
  ] as const)(
    'reauthorizes and executes the C2C order %s callback in the bound merchant scope',
    async (action, _label, resultText) => {
      const orderId = '00000000-0000-4000-8000-000000000060'
      authorization.authorize.mockResolvedValueOnce({
        allowed: true,
        capabilities: [TelegramCapability.C2C_ORDER_PAYMENT],
        group: { merchantId: 'merchant-1' },
        user: { username: 'operator' },
      })
      c2cOrderActions[action].mockResolvedValue({ text: resultText })
      const runtime = new TelegramRuntimeService(
        bots as never,
        authorization as never,
        telegram as never,
        manualPayments as never,
        batchPayments as never,
        queries as never,
        groups as never,
        c2cOrderActions as never,
      )

      await runtime.handle({
        botId: 'bot-1',
        tenantId: 'tenant-1',
        payload: {
          callback_query: {
            id: 'callback-1',
            data: `c2c:${action}:${orderId}`,
            from: { id: 88 },
            message: { message_id: 12, chat: { id: -1001, type: 'supergroup' } },
          },
        },
      })

      expect(authorization.authorize).toHaveBeenCalledWith(bot, '-1001', '88')
      expect(c2cOrderActions[action]).toHaveBeenCalledWith({
        merchantId: 'merchant-1',
        operator: 'TG:88',
        orderId,
        tenantId: 'tenant-1',
      })
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: resultText }),
      )
      expect(telegram.answerCallbackQuery).toHaveBeenCalledWith({
        tokenRef: 'env://TG_TOKEN',
        callbackQueryId: 'callback-1',
        text: resultText,
        showAlert: false,
      })
      expect(telegram.editMessageReplyMarkup).toHaveBeenCalledWith({
        tokenRef: 'env://TG_TOKEN',
        chatId: '-1001',
        messageId: 12,
      })
    },
  )

  it('replies with the Telegram user ID without requiring a group binding', async () => {
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
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
      groups as never,
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
      groups as never,
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
        message: {
          chatId: '-1001',
          chatType: 'supergroup',
          chatName: null,
          messageId: 11,
          text,
          userId: '88',
        },
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
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.ALIPAY_BATCH_PAYMENT],
      group: { merchantId: 'merchant-1' },
    })
    manualPayments.confirm.mockResolvedValue({ text: '已创建 1 笔支付订单' })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
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
      groups as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: { message_id: 13, chat: { id: -1001 }, from: { id: 88 }, text: '/query PAY001' },
      },
    })

    expect(queries.query).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'PAY001', {
      canReceipt: false,
      canVoid: false,
    })
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: '支付单号：PAY001' }),
    )
  })

  it('keeps shared query buttons when the callback user lacks receipt permission', async () => {
    const orderId = '00000000-0000-4000-8000-000000000071'
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.ORDER_QUERY],
      group: { merchantId: 'merchant-1' },
    })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        callback_query: {
          id: 'callback-no-receipt',
          data: `query:receipt:${orderId}`,
          from: { id: 88 },
          message: { message_id: 17, chat: { id: -1001, type: 'supergroup' } },
        },
      },
    })

    expect(queries.receipt).not.toHaveBeenCalled()
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ text: '您没有获取回单的权限', showAlert: true }),
    )
    expect(telegram.editMessageReplyMarkup).not.toHaveBeenCalled()
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
      groups as never,
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
      groups as never,
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
      groups as never,
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

  it('sends converted receipt pages as photos instead of text links', async () => {
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.RECEIPT_QUERY],
      group: { merchantId: 'merchant-1' },
    })
    queries.receipt.mockResolvedValue({
      parseMode: 'HTML',
      photos: [
        { content: Buffer.from('page-1'), fileName: 'PAY001-1.jpg' },
        { content: Buffer.from('page-2'), fileName: 'PAY001-2.jpg' },
      ],
      text: '<b>回单已生成</b>',
    })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 18,
          chat: { id: -1001 },
          from: { id: 88 },
          text: '/receipt PAY001',
        },
      },
    })

    expect(telegram.sendPhoto).toHaveBeenNthCalledWith(1, {
      tokenRef: 'env://TG_TOKEN',
      caption: '<b>回单已生成</b>',
      chatId: '-1001',
      fileName: 'PAY001-1.jpg',
      parseMode: 'HTML',
      photo: Buffer.from('page-1'),
      replyToMessageId: 18,
    })
    expect(telegram.sendPhoto).toHaveBeenNthCalledWith(2, {
      tokenRef: 'env://TG_TOKEN',
      chatId: '-1001',
      fileName: 'PAY001-2.jpg',
      photo: Buffer.from('page-2'),
    })
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('reauthorizes a batch callback before submission', async () => {
    const interactionId = '00000000-0000-4000-8000-000000000060'
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.PAYMENT_BATCH_SUBMIT],
      group: { merchantId: 'merchant-1' },
    })
    batchPayments.confirm.mockResolvedValue({ text: '已提交 1 个支付批次' })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
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

  it('allows an active Telegram super admin to bind a pending merchant group', async () => {
    authorization.canBindGroups.mockResolvedValue(true)
    groups.bindByMerchant.mockResolvedValue({ name: '商家群' })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 20,
          chat: { id: -1001, type: 'supergroup', title: '新商家群' },
          from: { id: 88 },
          text: '/bind MCH00123456',
        },
      },
    })

    expect(groups.bindByMerchant).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      botId: 'bot-1',
      merchantCode: 'MCH00123456',
      chatId: '-1001',
      chatType: 'supergroup',
      chatName: '新商家群',
    })
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('商家群绑定成功') }),
    )
  })

  it('rejects bind command from a non-super-admin', async () => {
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
    )
    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 21,
          chat: { id: -1001, type: 'supergroup' },
          from: { id: 88 },
          text: '/bind MCH00123456',
        },
      },
    })
    expect(groups.bindByMerchant).not.toHaveBeenCalled()
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: '只有机器人超级管理员可以绑定商家群' }),
    )
  })

  it('runs the complete appeal handler instead of directing the user to upload manually', async () => {
    authorization.authorize.mockResolvedValueOnce({
      allowed: true,
      capabilities: [TelegramCapability.C2C_APPEAL],
      group: { id: 'group-1', merchantId: 'merchant-1' },
    })
    c2cAppeals.prepare.mockResolvedValue({ text: '申诉提交成功\n申诉单号：CMP-1' })
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
      manualPayments as never,
      batchPayments as never,
      queries as never,
      groups as never,
      c2cOrderActions as never,
      c2cAppeals as never,
    )

    await runtime.handle({
      botId: 'bot-1',
      tenantId: 'tenant-1',
      payload: {
        message: {
          message_id: 22,
          chat: { id: -1001, type: 'supergroup' },
          from: { id: 88 },
          text: '/appeal BIN-1',
        },
      },
    })

    expect(c2cAppeals.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ orderReference: 'BIN-1' }),
    )
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('申诉提交成功') }),
    )
  })
})
