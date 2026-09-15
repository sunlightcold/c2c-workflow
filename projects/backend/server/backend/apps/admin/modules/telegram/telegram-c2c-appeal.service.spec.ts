import { TelegramInteractionAction, TelegramInteractionState } from '@admin/database'
import { TelegramC2cAppealService } from './telegram-c2c-appeal.service'
import { TelegramCapability } from './telegram-policy'

describe('TelegramC2cAppealService', () => {
  const orders = { findOne: jest.fn() }
  const appeals = { getReasons: jest.fn(), submit: jest.fn() }
  const interactions = { create: jest.fn(), acquire: jest.fn(), complete: jest.fn() }
  const context = {
    bot: { id: 'bot-1', tenantId: 'tenant-1' },
    authorization: {
      allowed: true as const,
      capabilities: [TelegramCapability.C2C_APPEAL],
      group: { id: 'group-1', merchantId: 'merchant-1' },
      user: {},
    },
    message: { chatId: '-1001', messageId: 12, userId: '88' },
  }
  let service: TelegramC2cAppealService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new TelegramC2cAppealService(orders as never, appeals as never, interactions as never)
    orders.findOne.mockResolvedValue({ id: 'order-1', platformOrderId: 'BIN-1' })
    appeals.submit.mockResolvedValue({
      complaintNo: 'CMP-1',
      orderNo: 'BIN-1',
      reason: '我已付款，卖家未放行',
      reasonCode: 1,
    })
  })

  it('submits immediately when Binance returns the pfa-pay default reason', async () => {
    appeals.getReasons.mockResolvedValue({
      orderNo: 'BIN-1',
      reasons: [{ reasonCode: 1, reasonDesc: '我已付款，卖家未放行' }],
    })

    await expect(service.prepare({ ...context, orderReference: 'BIN-1' })).resolves.toMatchObject({
      parseMode: 'HTML',
      text: expect.stringContaining('<b>申诉提交成功</b>'),
    })
    expect(orders.findOne).toHaveBeenCalledWith({
      where: { merchantId: 'merchant-1', platformOrderId: 'BIN-1', tenantId: 'tenant-1' },
    })
    expect(appeals.submit).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1', {
      reasonCode: 1,
    })
    expect(interactions.create).not.toHaveBeenCalled()
  })

  it('creates reason buttons when Binance does not return the default reason', async () => {
    appeals.getReasons.mockResolvedValue({
      orderNo: 'BIN-1',
      reasons: [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }],
    })
    interactions.create.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
    })

    const result = await service.prepare({ ...context, orderReference: 'BIN-1' })

    expect(interactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: TelegramInteractionAction.C2C_APPEAL_REASON,
        payload: { orderId: 'order-1' },
      }),
    )
    expect(result.replyMarkup).toEqual({
      inline_keyboard: [
        [
          {
            text: '卖家收款后未放行',
            callback_data: 'appeal:reason:00000000-0000-4000-8000-000000000099:6',
          },
        ],
      ],
    })
  })

  it('acquires and completes one reason callback inside the same group', async () => {
    interactions.acquire.mockResolvedValue({
      id: 'interaction-1',
      groupId: 'group-1',
      payload: { orderId: 'order-1' },
    })

    const result = await service.confirmReason({
      ...context,
      interactionId: 'interaction-1',
      reasonCode: 6,
    })

    expect(interactions.acquire).toHaveBeenCalledWith({
      action: TelegramInteractionAction.C2C_APPEAL_REASON,
      botId: 'bot-1',
      chatId: '-1001',
      id: 'interaction-1',
      telegramUserId: '88',
    })
    expect(appeals.submit).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1', {
      reasonCode: 6,
    })
    expect(interactions.complete).toHaveBeenCalledWith(
      'interaction-1',
      TelegramInteractionState.COMPLETED,
      null,
    )
    expect(result.text).toContain('申诉提交成功')
  })
})
