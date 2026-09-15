import {
  PaymentBatchStatus,
  PaymentSourceType,
  TelegramInteractionAction,
  TelegramInteractionState,
} from '@admin/database'
import { TelegramCapability } from './telegram-policy'
import { TelegramBatchPaymentService } from './telegram-batch-payment.service'

describe('TelegramBatchPaymentService', () => {
  const batches = { create: jest.fn(), findReadyGroups: jest.fn() }
  const execution = { submit: jest.fn() }
  const interactions = {
    create: jest.fn(),
    acquire: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
  }
  const service = new TelegramBatchPaymentService(
    batches as never,
    execution as never,
    interactions as never,
  )
  const context = {
    bot: {
      id: 'bot-1',
      tenantId: 'tenant-1',
      batchSubmitRequireConfirmation: true,
    },
    authorization: {
      allowed: true as const,
      capabilities: [TelegramCapability.PAYMENT_BATCH_SUBMIT],
      group: {
        id: 'group-1',
        merchantId: 'merchant-1',
        paymentScene: PaymentSourceType.BOT_MANUAL,
      },
      user: {},
    },
    message: { chatId: '-1001', messageId: 10, userId: '88' },
  }

  beforeEach(() => jest.clearAllMocks())

  it('groups ready orders by locked account, channel, and currency before confirmation', async () => {
    batches.findReadyGroups.mockResolvedValue([
      { paymentOrderIds: ['order-1', 'order-2'], totalAmount: '30.00' },
      { paymentOrderIds: ['order-3'], totalAmount: '30.00' },
    ])
    interactions.create.mockResolvedValue({ id: 'interaction-1' })

    const result = await service.prepare(context as never)

    expect(result.text).toContain('<b>请确认提交批次</b>')
    expect(result.text).toContain('待提交订单：<code>3</code> 笔')
    expect(result.text).toContain('批次组：<code>2</code> 组')
    expect(interactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: TelegramInteractionAction.SUBMIT_PAYMENT_BATCHES,
        payload: {
          groups: [
            { paymentOrderIds: ['order-1', 'order-2'], totalAmount: '30.00' },
            { paymentOrderIds: ['order-3'], totalAmount: '30.00' },
          ],
        },
      }),
    )
    expect(batches.findReadyGroups).toHaveBeenCalledWith('tenant-1', 'merchant-1')
  })

  it('finds bot manual orders even when the bound group handles C2C notifications', async () => {
    batches.findReadyGroups.mockResolvedValue([])
    const c2cContext = {
      ...context,
      authorization: {
        ...context.authorization,
        group: { ...context.authorization.group, paymentScene: PaymentSourceType.C2C_BUY },
      },
    }

    await service.prepare(c2cContext as never)

    expect(batches.findReadyGroups).toHaveBeenCalledWith('tenant-1', 'merchant-1')
  })

  it('reaquires the matching action and submits every snapshotted group', async () => {
    interactions.acquire.mockResolvedValue({
      id: 'interaction-1',
      groupId: 'group-1',
      payload: {
        groups: [{ paymentOrderIds: ['order-1', 'order-2'], totalAmount: '30.00' }],
      },
    })
    batches.create.mockResolvedValue({ batch: { id: 'batch-1', batchNo: 'BAT001' } })
    execution.submit.mockResolvedValue({ batchNo: 'BAT001', status: PaymentBatchStatus.PROCESSING })
    const confirmation = { ...context, interactionId: 'interaction-1' }

    await expect(service.confirm(confirmation as never)).resolves.toMatchObject({
      text: expect.stringContaining('已提交批次：<code>1</code>'),
    })
    expect(interactions.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ action: TelegramInteractionAction.SUBMIT_PAYMENT_BATCHES }),
    )
    expect(batches.create).toHaveBeenCalledWith('tenant-1', ['order-1', 'order-2'])
    expect(execution.submit).toHaveBeenCalledWith('tenant-1', 'batch-1')
    expect(interactions.complete).toHaveBeenCalledWith(
      'interaction-1',
      TelegramInteractionState.COMPLETED,
      null,
    )
  })

  it('does not cancel a batch interaction after submit permission is revoked', async () => {
    const revokedAuthorization = {
      ...context.authorization,
      capabilities: [],
    }
    const revokedContext = {
      ...context,
      authorization: revokedAuthorization,
      interactionId: 'interaction-1',
    }
    await expect(service.cancel(revokedContext as never)).resolves.toBe(false)
    expect(interactions.cancel).not.toHaveBeenCalled()
  })
})
