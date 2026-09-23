import { PaymentBatchStatus, PaymentOrderStatus, PlatformConfirmationStatus } from '@admin/database'
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
    expect(sql).not.toContain('merchant_order."identityMatched" = true')
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
    expect(paymentSql).toContain("payment_order.status = 'SUCCESS'")
    expect(paymentSql).toContain('INNER JOIN merchant')
    expect(paymentSql).toContain('merchant."paidConfirmNextAt" <= NOW()')
    expect(paymentSql).toContain('merchant."requestTimeoutMs" * 4 + 5000')
    expect(paymentSql).toContain('payment_order."platformConfirmAttempts"')
    expect(paymentSql).toContain('payment_order."platformConfirmLastAttemptAt"')
    expect(paymentSql).toContain('LIMIT $4')
    expect(paymentParameters).toEqual([
      [PaymentOrderStatus.SUBMITTING, PaymentOrderStatus.PROCESSING, PaymentOrderStatus.UNKNOWN],
      PlatformConfirmationStatus.PENDING,
      PlatformConfirmationStatus.PROCESSING,
      100,
    ])
    const [batchSql, batchParameters] = dataSource.query.mock.calls[1]
    expect(batchParameters[0]).toEqual([
      PaymentBatchStatus.SUBMITTING,
      PaymentBatchStatus.PROCESSING,
      PaymentBatchStatus.UNKNOWN,
    ])
    expect(batchSql).not.toContain("status = 'READY'")
    expect(batchSql).toContain('"nextReconcileAt" <= NOW()')
    expect(batchSql).toContain('"nextReconcileAt" IS NULL')
    expect(batchSql).not.toContain('status = \'SUBMITTING\' AND "nextReconcileAt" IS NULL')
    expect(batchSql).not.toContain('"updatedAt" <= NOW()')
    expect(batchSql).toContain('LIMIT $2')
    expect(batchParameters).toEqual([
      [PaymentBatchStatus.SUBMITTING, PaymentBatchStatus.PROCESSING, PaymentBatchStatus.UNKNOWN],
      100,
    ])
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

  it('claims each automatic payment failure notification only once', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([[{ id: 'notice-1' }], 1]) }
    const store = new TypeOrmC2cAutomaticPaymentStore(dataSource as never)
    const input = {
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      code: 'AUTOMATIC_PAYMENT_FAILED',
      referenceId: 'order-1',
      message: '404',
    }

    await expect(store.claimFailureNotification(input)).resolves.toBe(true)

    const [sql, parameters] = dataSource.query.mock.calls[0]
    expect(sql).toContain('ON CONFLICT ("tenantId", "merchantId", code, "referenceId") DO NOTHING')
    expect(parameters).toEqual([
      'tenant-1',
      'merchant-1',
      'AUTOMATIC_PAYMENT_FAILED',
      'order-1',
      '404',
    ])
  })
})
