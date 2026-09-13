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
      executionMode: PaymentExecutionMode.INSTANT,
      routingKey: 'C2C_BUY:order-1',
    }
    const first = await resolver.resolve(input)
    const repeated = await resolver.resolve(input)

    expect(repeated).toEqual(first)
    expect(first?.planId).not.toBe('backup')
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-1',
      'merchant-1',
      'C2C_BUY',
      'CNY',
      '100.00',
      'ALIPAY',
      PaymentExecutionMode.INSTANT,
    ])
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
})
