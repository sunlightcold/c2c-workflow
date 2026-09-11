import { PaymentExecutionMode, PaymentOrderStatus, PaymentSourceType } from '@admin/database'
import { PaymentBatchService } from './payment-batch.service'

describe('PaymentBatchService ready groups', () => {
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
      { paymentOrderIds: ['order-1', 'order-2'], totalAmount: '30.00' },
      { paymentOrderIds: ['order-3'], totalAmount: '30.00' },
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
    currency: 'CNY',
    paymentMethod: 'ALIPAY',
    executionMode: PaymentExecutionMode.BATCH,
    status: PaymentOrderStatus.READY,
    amount,
  }
}
