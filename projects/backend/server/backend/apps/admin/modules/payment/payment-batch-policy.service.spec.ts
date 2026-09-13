import { BusinessStatus, PaymentBatchPolicyScope, PaymentBatchRuleType } from '@admin/database'
import { PaymentBatchPolicyService } from './payment-batch-policy.service'

describe('PaymentBatchPolicyService', () => {
  const service = new PaymentBatchPolicyService(undefined!, undefined!, undefined!, undefined!)

  it('triggers when any enabled automatic rule matches the ready group', () => {
    const now = new Date('2026-09-13T10:10:00.000Z')
    const triggered = service.evaluateRules(
      [
        {
          id: 'interval-rule',
          ruleType: PaymentBatchRuleType.INTERVAL,
          intervalSeconds: 900,
          orderCount: null,
        },
        {
          id: 'count-rule',
          ruleType: PaymentBatchRuleType.ORDER_COUNT,
          intervalSeconds: null,
          orderCount: 5,
        },
      ],
      {
        now,
        oldestReadyAt: new Date('2026-09-13T10:05:00.000Z'),
        readyCount: 5,
      },
    )

    expect(triggered).toEqual(['count-rule'])
  })

  it('never auto-submits a policy containing only manual rules', () => {
    expect(
      service.evaluateRules(
        [
          {
            id: 'manual-rule',
            ruleType: PaymentBatchRuleType.MANUAL,
            intervalSeconds: null,
            orderCount: null,
          },
        ],
        {
          now: new Date('2026-09-13T10:10:00.000Z'),
          oldestReadyAt: new Date('2026-09-13T09:00:00.000Z'),
          readyCount: 100,
        },
      ),
    ).toEqual([])
  })

  it('creates a global policy without a merchant scope', async () => {
    const merchants = { findOne: jest.fn() }
    const manager = {
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
    }
    const dataSource = { transaction: jest.fn((work) => work(manager)) }
    const globalService = new PaymentBatchPolicyService(
      undefined!,
      undefined!,
      merchants as never,
      dataSource as never,
    )

    const result = await globalService.create('tenant-1', {
      name: '经营单位默认批次策略',
      scopeType: PaymentBatchPolicyScope.GLOBAL,
      rules: [
        {
          ruleType: PaymentBatchRuleType.MANUAL,
          status: BusinessStatus.ACTIVE,
        },
      ],
    })

    expect(merchants.findOne).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        merchantId: null,
        scopeType: PaymentBatchPolicyScope.GLOBAL,
      }),
    )
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ merchantId: null }),
    )
  })

  it('rejects a global policy carrying a merchant id', async () => {
    const merchants = { findOne: jest.fn() }
    const dataSource = { transaction: jest.fn() }
    const globalService = new PaymentBatchPolicyService(
      undefined!,
      undefined!,
      merchants as never,
      dataSource as never,
    )

    await expect(
      globalService.create('tenant-1', {
        merchantId: 'merchant-1',
        name: '错误全局策略',
        scopeType: PaymentBatchPolicyScope.GLOBAL,
        rules: [
          {
            ruleType: PaymentBatchRuleType.MANUAL,
            status: BusinessStatus.ACTIVE,
          },
        ],
      }),
    ).rejects.toThrow('全局策略不能指定商家')
  })
})
