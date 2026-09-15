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
    capabilities: [TelegramCapability.ALIPAY_BATCH_PAYMENT],
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
      id: 'payment-order-1',
      paymentNo: 'PAY001',
      sourceBusinessNo: 'ORDER-1',
      amount: '100.50',
      payeeName: '张三',
      payeeIdentity: '13800138000',
      status: PaymentOrderStatus.READY,
    }),
  }
  const interactions = {
    acquire: jest.fn(),
    cancel: jest.fn(),
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

    expect(result.text).toContain('<b>请确认转账信息</b>')
    expect(result.text).toContain('商户订单号：<code>ORDER-1</code>')
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

  it('allows manual payments in a C2C group when the capability is enabled', async () => {
    const service = new TelegramManualPaymentService(
      plans as never,
      paymentOrders as never,
      orders as never,
      interactions as never,
    )
    const c2cAuthorization = {
      ...authorization,
      group: { ...authorization.group, paymentScene: 'C2C_BUY' },
    }

    const result = await service.prepare({
      bot,
      authorization: c2cAuthorization as never,
      message,
      text: 'ORDER-C2C-1\n100.50\n张三\n13800138000',
    })

    expect(result.text).toContain('<b>请确认转账信息</b>')
    expect(interactions.create).toHaveBeenCalled()
  })

  it('rejects manual payments when the capability is disabled', async () => {
    const service = new TelegramManualPaymentService(
      plans as never,
      paymentOrders as never,
      orders as never,
      interactions as never,
    )
    const authorizationWithoutManualPayment = { ...authorization, capabilities: [] }

    await expect(
      service.prepare({
        bot,
        authorization: authorizationWithoutManualPayment as never,
        message,
        text: 'ORDER-1\n100.50\n张三\n13800138000',
      }),
    ).resolves.toEqual({ text: '您没有创建支付订单的权限' })
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
    expect(result.text).toContain('<b>订单已受理</b>')
    expect(result.text).toContain('商户订单号：<code>ORDER-1</code>')
    expect(result.replyMarkup?.inline_keyboard[0]).toEqual([
      { text: '查询订单', callback_data: 'query:order:payment-order-1' },
      { text: '作废订单', callback_data: 'query:void:payment-order-1' },
    ])
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

  it('does not cancel a payment interaction after the capability is revoked', async () => {
    const service = new TelegramManualPaymentService(
      plans as never,
      paymentOrders as never,
      orders as never,
      interactions as never,
    )

    const revokedAuthorization = {
      ...authorization,
      capabilities: [],
    }
    await expect(
      service.cancel({
        interactionId: 'interaction-1',
        bot,
        authorization: revokedAuthorization as never,
        message,
      }),
    ).resolves.toBe(false)
    expect(interactions.cancel).not.toHaveBeenCalled()
  })
})
