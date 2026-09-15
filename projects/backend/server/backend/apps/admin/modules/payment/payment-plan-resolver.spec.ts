import { PaymentExecutionMode } from '@admin/database'
import { PaymentPlanResolver } from './payment-plan-resolver'

describe('PaymentPlanResolver', () => {
  const dataSource = { query: jest.fn() }
  const resolver = new PaymentPlanResolver(dataSource as never)

  beforeEach(() => jest.clearAllMocks())

  it('selects one eligible target deterministically from the highest-priority group', async () => {
    dataSource.query.mockResolvedValue([
      {
        planId: 'plan-a',
        batchPolicyId: null,
        paymentAccountId: 'account-a',
        paymentAccountChannelId: 'channel-a',
        adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
        executionMode: 'INSTANT',
        priority: 10,
        weight: 20,
      },
      {
        planId: 'plan-b',
        batchPolicyId: null,
        paymentAccountId: 'account-b',
        paymentAccountChannelId: 'channel-b',
        adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
        executionMode: 'INSTANT',
        priority: 10,
        weight: 80,
      },
      {
        planId: 'backup',
        batchPolicyId: null,
        paymentAccountId: 'backup-account',
        paymentAccountChannelId: 'backup-channel',
        adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
        executionMode: 'INSTANT',
        priority: 20,
        weight: 100,
      },
    ])

    const input = {
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      scene: 'C2C_BUY',
      currency: 'CNY',
      amount: '100.00',
      paymentMethod: 'ALIPAY',
      routingKey: 'C2C_BUY:order-1',
    }
    const first = await resolver.resolve(input)
    const repeated = await resolver.resolve(input)

    expect(repeated).toEqual(first)
    expect(first?.planId).not.toBe('backup')
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-1',
      'merchant-1',
      'CNY',
      '100.00',
      'ALIPAY',
      null,
      false,
    ])
    expect(first?.executionMode).toBe(PaymentExecutionMode.INSTANT)
  })

  it('returns null when no account channel satisfies the complete route', async () => {
    dataSource.query.mockResolvedValue([])

    await expect(
      resolver.resolve({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        scene: 'BOT_MANUAL',
        currency: 'CNY',
        amount: '5000.00',
        paymentMethod: 'ALIPAY',
        executionMode: PaymentExecutionMode.BATCH,
        routingKey: 'BOT_MANUAL:manual-1',
      }),
    ).resolves.toBeNull()
  })

  it('routes manual and C2C orders from the same eligible payment-plan pool', async () => {
    dataSource.query.mockResolvedValue([
      {
        planId: 'c2c-batch-plan',
        batchPolicyId: 'batch-policy-1',
        paymentAccountId: 'batch-account',
        paymentAccountChannelId: 'batch-channel',
        adapterCode: 'ALIPAY_BATCH',
        executionMode: 'BATCH',
        priority: 10,
        weight: 100,
      },
    ])

    await expect(
      resolver.resolve({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        scene: 'BOT_MANUAL',
        currency: 'CNY',
        amount: '100.00',
        paymentMethod: 'ALIPAY',
        executionMode: PaymentExecutionMode.BATCH,
        routingKey: 'BOT_MANUAL:manual-1',
      }),
    ).resolves.toMatchObject({ planId: 'c2c-batch-plan', batchPolicyId: 'batch-policy-1' })
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-1',
      'merchant-1',
      'CNY',
      '100.00',
      'ALIPAY',
      PaymentExecutionMode.BATCH,
      false,
    ])
    expect(dataSource.query).toHaveBeenCalledTimes(1)
  })

  it('restricts automatic discovery to plans enabled for automatic payment', async () => {
    dataSource.query.mockResolvedValue([])

    await resolver.resolve({
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      scene: 'C2C_BUY',
      currency: 'CNY',
      amount: '100.00',
      paymentMethod: 'ALIPAY',
      automaticOnly: true,
      routingKey: 'order-1',
    })

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-1',
      'merchant-1',
      'CNY',
      '100.00',
      'ALIPAY',
      null,
      true,
    ])
    expect(dataSource.query.mock.calls[0][0]).toContain('plan."automaticPaymentEnabled" = true')
  })

  it('does not let the source prefix change deterministic route selection', async () => {
    const candidates = [
      {
        planId: 'plan-a',
        batchPolicyId: null,
        paymentAccountId: 'account-a',
        paymentAccountChannelId: 'channel-a',
        adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
        executionMode: 'INSTANT',
        priority: 10,
        weight: 20,
      },
      {
        planId: 'plan-b',
        batchPolicyId: null,
        paymentAccountId: 'account-b',
        paymentAccountChannelId: 'channel-b',
        adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
        executionMode: 'INSTANT',
        priority: 10,
        weight: 80,
      },
    ]
    dataSource.query.mockResolvedValue(candidates)
    const common = {
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      currency: 'CNY',
      amount: '100.00',
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.INSTANT,
    }

    const manual = await resolver.resolve({
      ...common,
      scene: 'BOT_MANUAL',
      routingKey: 'business-1',
    })
    const c2c = await resolver.resolve({ ...common, scene: 'C2C_BUY', routingKey: 'business-1' })
    expect(c2c).toEqual(manual)
  })
})
