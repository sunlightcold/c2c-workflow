import { TelegramCapability } from './telegram-policy'
import { TelegramRuntimeService } from './telegram-runtime.service'

describe('TelegramRuntimeService', () => {
  const bot = {
    id: 'bot-1',
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

  beforeEach(() => jest.clearAllMocks())

  it('replies with the Telegram user ID without requiring a group binding', async () => {
    const runtime = new TelegramRuntimeService(
      bots as never,
      authorization as never,
      telegram as never,
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
})
