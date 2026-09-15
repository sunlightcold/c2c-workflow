import { BusinessStatus, PaymentBatchItemStatus, TelegramGroupBindingState } from '@admin/database'
import type { TelegramApiClient } from './telegram-api.client'
import {
  TelegramNotificationService,
  TelegramNotificationEvent,
} from './telegram-notification.service'

describe('TelegramNotificationService', () => {
  const groups = { find: jest.fn() }
  const bots = { findOne: jest.fn() }
  const merchantOrders = { find: jest.fn() }
  const paymentOrders = { findOne: jest.fn() }
  const paymentBatches = { findOne: jest.fn() }
  const telegram = { sendMessage: jest.fn() } as unknown as TelegramApiClient
  const service = new TelegramNotificationService(
    groups as never,
    bots as never,
    merchantOrders as never,
    paymentOrders as never,
    paymentBatches as never,
    telegram,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    groups.find.mockResolvedValue([])
    merchantOrders.find.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        platformOrderId: 'ORD-1',
        fiatAmount: '10.00',
        fiatCurrency: 'CNY',
        payeeName: 'Payee',
        payeeIdentity: 'id',
        paymentMethod: 'ALIPAY',
        status: 'PENDING_PAYMENT',
        identityMatched: false,
        payable: true,
      },
    ])
    paymentOrders.findOne.mockResolvedValue(null)
    paymentBatches.findOne.mockResolvedValue(null)
    bots.findOne.mockResolvedValue({
      id: 'bot-1',
      tenantId: 'tenant-a',
      status: BusinessStatus.ACTIVE,
      tokenRef: 'env://TG',
    })
  })

  it('sends an order notification only to active groups bound to the same tenant and merchant', async () => {
    groups.find.mockResolvedValue([
      {
        id: 'group-a',
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.ORDER_DISCOVERED],
      },
      {
        id: 'group-b',
        tenantId: 'tenant-a',
        merchantId: 'merchant-b',
        botId: 'bot-2',
        chatId: 'chat-b',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.ORDER_DISCOVERED],
      },
      {
        id: 'group-c',
        tenantId: 'tenant-b',
        merchantId: 'merchant-a',
        botId: 'bot-3',
        chatId: 'chat-c',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.ORDER_DISCOVERED],
      },
    ])

    await service.notifyOrderDiscovered({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      orderIds: ['order-1'],
    })

    expect(groups.find).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
      },
    })
    expect(bots.findOne).toHaveBeenCalledWith({
      where: { id: 'bot-1', tenantId: 'tenant-a', status: BusinessStatus.ACTIVE },
      select: { id: true, tenantId: true, tokenRef: true, status: true },
    })
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-a',
        tokenRef: 'env://TG',
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '确认下单',
                callback_data: 'c2c:confirm:00000000-0000-4000-8000-000000000001',
              },
              {
                text: '作废订单',
                callback_data: 'c2c:cancel:00000000-0000-4000-8000-000000000001',
              },
            ],
          ],
        },
      }),
    )
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('does not send when the event is disabled or the group has no chat id', async () => {
    groups.find.mockResolvedValue([
      {
        id: 'group-a',
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: null,
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.ORDER_DISCOVERED],
      },
      {
        id: 'group-b',
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-b',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [],
      },
    ])

    await service.notifyOrderDiscovered({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      orderIds: ['order-1'],
    })

    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('adds a receipt action only to successful payment notifications', async () => {
    groups.find.mockResolvedValue([
      {
        id: 'group-a',
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.PAYMENT_STATUS],
      },
    ])
    paymentOrders.findOne.mockResolvedValue({ paymentNo: 'PAY-1', sourceBusinessNo: 'ORD-1' })

    await service.notifyPaymentStatus({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      paymentOrderId: '00000000-0000-4000-8000-000000000001',
      status: 'COMPLETED',
    })

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        parseMode: 'HTML',
        text: expect.stringContaining('<b>转账成功</b>'),
        replyMarkup: {
          inline_keyboard: [
            [{ text: '获取回单', callback_data: 'receipt:00000000-0000-4000-8000-000000000001' }],
          ],
        },
      }),
    )
  })

  it('sends the automatic batch submission notice to the merchant groups', async () => {
    groups.find.mockResolvedValue([
      {
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.BATCH_STATUS],
      },
    ])

    await service.onBatchSubmitted({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      totalCount: 6,
      totalAmount: '1944.15',
      groups: 1,
      submitted: 1,
      failed: 0,
    })

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('<b>自动批次提交结果</b>'),
      }),
    )
  })

  it.each([
    'CREATED',
    'SUBMITTING',
    'PROCESSING',
    'SUCCESS',
    'UNKNOWN',
    'PLATFORM_CONFIRM_PENDING',
  ])('does not notify payment intermediate status %s', async (status) => {
    groups.find.mockResolvedValue([
      {
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.PAYMENT_STATUS],
      },
    ])

    await service.notifyPaymentStatus({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      paymentOrderId: '00000000-0000-4000-8000-000000000001',
      status,
    })

    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('sends one notification when an automatic payment order is created', async () => {
    groups.find.mockResolvedValue([
      {
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.PAYMENT_STATUS],
      },
    ])
    paymentOrders.findOne.mockResolvedValue({
      paymentNo: 'PAY-1',
      sourceBusinessNo: 'ORDER-1',
      amount: '10.00',
      currency: 'CNY',
      payeeName: '张三',
      payeeIdentity: 'buyer@example.com',
      status: 'READY',
    })

    await service.notifyPaymentStatus({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      paymentOrderId: 'payment-1',
      paymentNo: 'PAY-1',
      status: 'READY',
    })

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('已创建，待处理') }),
    )
  })

  it('keeps automatically payable orders silent at discovery time', async () => {
    merchantOrders.find.mockResolvedValue([
      {
        platformOrderId: 'AUTO-1',
        status: 'PENDING_PAYMENT',
        identityMatched: true,
        payable: true,
      },
    ])

    await service.notifyOrderDiscovered({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      orderIds: ['order-1'],
    })

    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('does not send individual results for a batch child payment', async () => {
    const batchItems = {
      findOne: jest.fn().mockResolvedValue({ status: PaymentBatchItemStatus.SUCCESS }),
    }
    const batchAware = new TelegramNotificationService(
      groups as never,
      bots as never,
      merchantOrders as never,
      paymentOrders as never,
      paymentBatches as never,
      telegram,
      batchItems as never,
    )
    groups.find.mockResolvedValue([
      {
        tenantId: 'tenant-a',
        merchantId: 'merchant-a',
        botId: 'bot-1',
        chatId: 'chat-a',
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
        notificationEvents: [TelegramNotificationEvent.PAYMENT_STATUS],
      },
    ])
    paymentOrders.findOne.mockResolvedValue({ paymentNo: 'PAY-BATCH-1' })

    await batchAware.notifyPaymentStatus({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      paymentOrderId: '00000000-0000-4000-8000-000000000001',
      status: 'COMPLETED',
    })

    expect(batchItems.findOne).toHaveBeenCalled()
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })
})
