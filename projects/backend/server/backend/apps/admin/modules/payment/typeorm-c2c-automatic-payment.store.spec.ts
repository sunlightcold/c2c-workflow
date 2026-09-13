import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import { TypeOrmC2cAutomaticPaymentStore } from './typeorm-c2c-automatic-payment.store'

describe('TypeOrmC2cAutomaticPaymentStore', () => {
  it('selects only safe automatic payment candidates', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) }
    const store = new TypeOrmC2cAutomaticPaymentStore(dataSource as never)
    const now = new Date('2026-09-13T02:00:00.000Z')

    await store.findCandidates(now, 100)

    const [sql, parameters] = dataSource.query.mock.calls[0]
    expect(sql).toContain('merchant."automaticPaymentEnabled" = true')
    expect(sql).toContain('merchant_order."identityMatched" = true')
    expect(sql).toContain(`merchant_order."paymentMethod" = 'ALIPAY'`)
    expect(sql).toContain(`merchant_order."fiatCurrency" = 'CNY'`)
    expect(sql).toContain('merchant_order."paymentDeadline" > $2')
    expect(parameters).toEqual(['C2C_BUY', now, 100])
  })

  it('recovers active results but excludes batch items from single-payment queries', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) }
    const store = new TypeOrmC2cAutomaticPaymentStore(dataSource as never)

    await store.findRecoverablePayments(100)
    await store.findRecoverableBatches(100)

    expect(dataSource.query.mock.calls[0][0]).toContain('NOT EXISTS')
    expect(dataSource.query.mock.calls[0][1][1]).toEqual([
      PaymentOrderStatus.SUBMITTING,
      PaymentOrderStatus.PROCESSING,
      PaymentOrderStatus.UNKNOWN,
      PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
    ])
    expect(dataSource.query.mock.calls[1][1][0]).toEqual([
      PaymentBatchStatus.SUBMITTING,
      PaymentBatchStatus.PROCESSING,
      PaymentBatchStatus.UNKNOWN,
    ])
  })
})
