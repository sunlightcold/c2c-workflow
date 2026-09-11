import { PaymentExecutionMode, PaymentOrderStatus, TelegramInteractionState } from '@admin/database'
import { TelegramManualPaymentService } from './telegram-manual-payment.service'
import { TelegramCapability } from './telegram-policy'

describe('TelegramManualPaymentService', () => {
  const bot = {
    id: 'bot-1',
    tenantId: 'tenant-1',
    paymentOrderRequireConfirmation: true,
  }
  const authorization = {
    allowed: true as const,
    capabilities: [TelegramCapability.MANUAL_PAYMENT],
    group: {
      id: 'group-1',
      merchantId: 'merchant-1',
      paymentScene: 'BOT_MANUAL',
    },
    user: { id: 7 },
  }
  const message = { chatId: '-1001', messageId: 9, userId: '88' }
  const plans = {
    resolve: jest.fn().mockResolvedValue({ executionMode: PaymentExecutionMode.BATCH }),
  }
  const paymentOrders = { findOne: jest.fn().mockResolvedValue(null) }
  const orders = {
    create: jest.fn().mockResolvedValue({
      paymentNo: 'PAY001',
      status: PaymentOrderStatus.READY,
    }),
  }
  const interactions = {
    acquire: jest.fn(),
    complete: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'interaction-1' }),
  }

  beforeEach(() => jest.clearAllMocks())

  it('creates a confirmation context for valid four-line payments without creating orders', async () => {
    const service = new TelegramManualPaymentService(
      plans as never,
      paymentOrders as never,
      orders as never,
      interactions as never,
    )

    const result = await service.prepare({
      bot,
      authorization: authorization as never,
      message,
      text: 'ORDER-1\n100.50\n张三\n13800138000',
    })

    expect(result.text).toContain('待确认 1 笔')
    expect(result.text).toContain('合计 100.50 CNY')
    expect(result.replyMarkup).toEqual({
      inline_keyboard: [
        [
          { text: '确认下单', callback_data: 'payment:confirm:interaction-1' },
          { text: '取消', callback_data: 'payment:cancel:interaction-1' },
        ],
      ],
    })
    expect(interactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'bot-1',
        groupId: 'group-1',
        telegramUserId: '88',
        payload: {
          payments: [
            {
              amount: '100.50',
              payeeIdentity: '13800138000',
              payeeName: '张三',
              sourceBusinessNo: 'ORDER-1',
            },
          ],
        },
      }),
    )
    expect(orders.create).not.toHaveBeenCalled()
  })

  it('creates each payment once after atomically acquiring a confirmation', async () => {
    interactions.acquire.mockResolvedValue({
      id: 'interaction-1',
      groupId: 'group-1',
      payload: {
        payments: [
          {
            amount: '100.50',
            payeeIdentity: '13800138000',
            payeeName: '张三',
            sourceBusinessNo: 'ORDER-1',
          },
        ],
      },
    })
    const service = new TelegramManualPaymentService(
      plans as never,
      paymentOrders as never,
      orders as never,
      interactions as never,
    )

    const result = await service.confirm({
      interactionId: 'interaction-1',
      bot,
      authorization: authorization as never,
      message,
    })

    expect(orders.create).toHaveBeenCalledWith('tenant-1', {
      merchantId: 'merchant-1',
      sourceType: 'BOT_MANUAL',
      sourceBusinessNo: 'ORDER-1',
      amount: '100.50',
      currency: 'CNY',
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.BATCH,
      payeeIdentity: '13800138000',
      payeeName: '张三',
    })
    expect(interactions.complete).toHaveBeenCalledWith(
      'interaction-1',
      TelegramInteractionState.COMPLETED,
      null,
    )
    expect(result.text).toContain('已创建 1 笔支付订单')
  })

  it('does not create orders when the interaction was already acquired', async () => {
    interactions.acquire.mockResolvedValue(null)
    const service = new TelegramManualPaymentService(
      plans as never,
      paymentOrders as never,
      orders as never,
      interactions as never,
    )

    await expect(
      service.confirm({
        interactionId: 'interaction-1',
        bot,
        authorization: authorization as never,
        message,
      }),
    ).resolves.toEqual({ text: '该确认已处理、已失效或不属于您' })
    expect(orders.create).not.toHaveBeenCalled()
  })
})
