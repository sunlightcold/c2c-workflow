import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import { TelegramQueryService } from './telegram-query.service'

describe('TelegramQueryService', () => {
  const orders = { findOne: jest.fn() }
  const batches = { findOne: jest.fn() }
  const dataSource = { query: jest.fn() }
  const service = new TelegramQueryService(orders as never, batches as never, dataSource as never)

  beforeEach(() => jest.clearAllMocks())

  it('queries an order only inside the authorized tenant and merchant', async () => {
    orders.findOne.mockResolvedValue({
      paymentNo: 'PAY001',
      sourceBusinessNo: 'M001',
      amount: '100.00',
      currency: 'CNY',
      payeeName: 'Zhang San',
      payeeIdentity: '13800138000',
      status: PaymentOrderStatus.SUCCESS,
    })

    await expect(service.query('tenant-1', 'merchant-1', 'PAY001')).resolves.toContain(
      '支付单号：PAY001',
    )
    expect(orders.findOne).toHaveBeenCalledWith({
      where: [
        { tenantId: 'tenant-1', merchantId: 'merchant-1', paymentNo: 'PAY001' },
        { tenantId: 'tenant-1', merchantId: 'merchant-1', sourceBusinessNo: 'PAY001' },
      ],
    })
  })

  it('falls back to a merchant-scoped batch query', async () => {
    orders.findOne.mockResolvedValue(null)
    batches.findOne.mockResolvedValue({
      batchNo: 'BAT001',
      totalCount: 2,
      totalAmount: '30.00',
      successCount: 1,
      failedCount: 0,
      processingCount: 1,
      unknownCount: 0,
      status: PaymentBatchStatus.PROCESSING,
    })

    await expect(service.query('tenant-1', 'merchant-1', 'BAT001')).resolves.toContain(
      '支付批次：BAT001',
    )
    expect(batches.findOne).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', merchantId: 'merchant-1', batchNo: 'BAT001' },
    })
  })

  it('returns today statistics scoped to the authorized merchant', async () => {
    dataSource.query.mockResolvedValue([
      { totalCount: '3', totalAmount: '60.00', successCount: '2', successAmount: '50.00' },
    ])

    await expect(service.todayStats('tenant-1', 'merchant-1')).resolves.toContain(
      '成功：2 笔 / 50.00 CNY',
    )
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('"merchantId" = $2'), [
      'tenant-1',
      'merchant-1',
    ])
  })
})
