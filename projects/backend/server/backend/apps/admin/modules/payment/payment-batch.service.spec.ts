import { PaymentExecutionMode, PaymentOrderStatus, PaymentSourceType } from '@admin/database'
import { PaymentBatchService } from './payment-batch.service'

describe('PaymentBatchService ready groups', () => {
  it('returns payment and recipient information with batch detail items', async () => {
    const batch = { id: 'batch-1', tenantId: 'tenant-1', merchantId: 'merchant-1' }
    const item = {
      id: 'item-1',
      batchId: 'batch-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      paymentOrderId: 'order-1',
    }
    const dataSource = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue(batch) })
        .mockReturnValueOnce({ find: jest.fn().mockResolvedValue([item]) })
        .mockReturnValueOnce({
          find: jest.fn().mockResolvedValue([
            {
              id: 'order-1',
              paymentNo: 'PAY20260914001',
              payeeName: '张三',
              payeeIdentity: 'account@example.com',
            },
          ]),
        }),
    }
    const service = new PaymentBatchService(dataSource as never)

    await expect(service.detail('tenant-1', 'batch-1')).resolves.toEqual({
      batch,
      items: [
        expect.objectContaining({
          paymentNo: 'PAY20260914001',
          payeeName: '张三',
          payeeIdentity: 'account@example.com',
        }),
      ],
    })
  })

  it('excludes active batch items and groups by locked payment dimensions', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          order('order-1', 'account-1', 'channel-1', '10.00'),
          order('order-2', 'account-1', 'channel-1', '20.00'),
          order('order-3', 'account-2', 'channel-2', '30.00'),
        ]),
    }
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(query) }
    const dataSource = { getRepository: jest.fn().mockReturnValue(repository) }
    const service = new PaymentBatchService(dataSource as never)

    await expect(
      service.findReadyGroups('tenant-1', 'merchant-1', PaymentSourceType.BOT_MANUAL),
    ).resolves.toEqual([
      {
        batchPolicyId: 'policy-1',
        currency: 'CNY',
        merchantId: 'merchant-1',
        oldestReadyAt: new Date('2026-09-13T01:00:00.000Z'),
        paymentAccountChannelId: 'channel-1',
        paymentAccountId: 'account-1',
        paymentOrderIds: ['order-1', 'order-2'],
        totalAmount: '30.00',
      },
      {
        batchPolicyId: 'policy-1',
        currency: 'CNY',
        merchantId: 'merchant-1',
        oldestReadyAt: new Date('2026-09-13T01:00:00.000Z'),
        paymentAccountChannelId: 'channel-2',
        paymentAccountId: 'account-2',
        paymentOrderIds: ['order-3'],
        totalAmount: '30.00',
      },
    ])
    expect(query.where).toHaveBeenCalledWith('payment_order."tenantId" = :tenantId', {
      tenantId: 'tenant-1',
    })
    expect(query.andWhere).toHaveBeenCalledWith('payment_order."merchantId" = :merchantId', {
      merchantId: 'merchant-1',
    })
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), {
      activeItemStatuses: ['QUEUED', 'SUBMITTING', 'PROCESSING', 'UNKNOWN'],
    })
  })

  it('finds a global policy ready groups across merchants without mixing them', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          order('order-1', 'account-1', 'channel-1', '10.00'),
          { ...order('order-2', 'account-1', 'channel-1', '20.00'), merchantId: 'merchant-2' },
        ]),
    }
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(query) }
    const dataSource = { getRepository: jest.fn().mockReturnValue(repository) }
    const service = new PaymentBatchService(dataSource as never)

    const groups = await service.findReadyGroups(
      'tenant-1',
      null,
      PaymentSourceType.C2C_BUY,
      'policy-1',
    )

    expect(
      groups.map(({ merchantId, paymentOrderIds }) => ({ merchantId, paymentOrderIds })),
    ).toEqual([
      { merchantId: 'merchant-1', paymentOrderIds: ['order-1'] },
      { merchantId: 'merchant-2', paymentOrderIds: ['order-2'] },
    ])
    expect(query.andWhere).not.toHaveBeenCalledWith(
      'payment_order."merchantId" = :merchantId',
      expect.anything(),
    )
  })
})

function order(
  id: string,
  paymentAccountId: string,
  paymentAccountChannelId: string,
  amount: string,
) {
  return {
    id,
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    sourceType: PaymentSourceType.BOT_MANUAL,
    paymentAccountId,
    paymentAccountChannelId,
    batchPolicyId: 'policy-1',
    createdAt: new Date('2026-09-13T01:00:00.000Z'),
    currency: 'CNY',
    paymentMethod: 'ALIPAY',
    executionMode: PaymentExecutionMode.BATCH,
    status: PaymentOrderStatus.READY,
    amount,
  }
}
