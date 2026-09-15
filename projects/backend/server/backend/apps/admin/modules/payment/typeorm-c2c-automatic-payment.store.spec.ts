import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import { TypeOrmC2cAutomaticPaymentStore } from './typeorm-c2c-automatic-payment.store'

describe('TypeOrmC2cAutomaticPaymentStore', () => {
  it('selects only safe automatic payment candidates', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) }
    const store = new TypeOrmC2cAutomaticPaymentStore(dataSource as never)
    const now = new Date('2026-09-13T02:00:00.000Z')

    await store.findCandidates(now, 100)

    const [sql, parameters] = dataSource.query.mock.calls[0]
    expect(sql).toContain("tenant.status = 'active'")
    expect(sql).toContain('plan."automaticPaymentEnabled" = true')
    expect(sql).toContain('merchant_order."identityMatched" = true')
    expect(sql).toContain(`merchant_order."paymentMethod" = 'ALIPAY'`)
    expect(sql).toContain(`merchant_order."fiatCurrency" = 'CNY'`)
    expect(sql).not.toContain('merchant_order."paymentDeadline"')
    expect(parameters).toEqual(['C2C_BUY', 100])
  })

  it('recovers submitted payments from every source but excludes batch items from single-payment queries', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) }
    const store = new TypeOrmC2cAutomaticPaymentStore(dataSource as never)

    await store.findRecoverablePayments(100)
    await store.findRecoverableBatches(100)

    const [paymentSql, paymentParameters] = dataSource.query.mock.calls[0]
    expect(paymentSql).toContain('NOT EXISTS')
    expect(paymentSql).not.toContain('payment_order."sourceType"')
    expect(paymentSql).toContain('payment_order.status = ANY($1::payment_order_status_enum[])')
    expect(paymentSql).toContain('LIMIT $2')
    expect(paymentParameters).toEqual([
      [
        PaymentOrderStatus.SUBMITTING,
        PaymentOrderStatus.PROCESSING,
        PaymentOrderStatus.UNKNOWN,
        PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
      ],
      100,
    ])
    expect(dataSource.query.mock.calls[1][1][0]).toEqual([
      PaymentBatchStatus.SUBMITTING,
      PaymentBatchStatus.PROCESSING,
      PaymentBatchStatus.UNKNOWN,
    ])
    expect(dataSource.query.mock.calls[1][0]).toContain('"nextReconcileAt" <= NOW()')
  })

  it('builds automatic batch scopes from all ready batch orders regardless of source', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) }
    const store = new TypeOrmC2cAutomaticPaymentStore(dataSource as never)

    await store.findBatchScopes(100)

    const [sql, parameters] = dataSource.query.mock.calls[0]
    expect(sql).toContain("payment_order.status = 'READY'")
    expect(sql).toContain('payment_order."executionMode" = \'BATCH\'')
    expect(sql).not.toContain('payment_order."sourceType" = $1')
    expect(sql).not.toContain('merchant."automaticPaymentEnabled" = true')
    expect(sql).toContain('LIMIT $1')
    expect(sql).not.toContain('LIMIT $2')
    expect(parameters).toEqual([100])
  })
})
