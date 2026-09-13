import { BusinessStatus, TelegramGroupBindingState } from '@admin/database'
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
        platformOrderId: 'ORD-1',
        fiatAmount: '10.00',
        fiatCurrency: 'CNY',
        payeeName: 'Payee',
        payeeIdentity: 'id',
        status: 'PENDING_PAYMENT',
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
      expect.objectContaining({ chatId: 'chat-a', tokenRef: 'env://TG' }),
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
        replyMarkup: {
          inline_keyboard: [
            [{ text: '获取回单', callback_data: 'receipt:00000000-0000-4000-8000-000000000001' }],
          ],
        },
      }),
    )
  })
})
