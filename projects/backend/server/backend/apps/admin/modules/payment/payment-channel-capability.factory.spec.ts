import { PaymentAdapterCode } from '@admin/database'
import { AlipayPaymentChannelCapabilityFactory } from './payment-channel-capability.factory'

describe('AlipayPaymentChannelCapabilityFactory', () => {
  it('binds create, query, batch, and receipt capabilities to one account gateway', async () => {
    const gateway = { execute: jest.fn() }
    const gateways = { create: jest.fn().mockResolvedValue(gateway) }
    const factory = new AlipayPaymentChannelCapabilityFactory(gateways)

    const capabilities = await factory.create(
      PaymentAdapterCode.ALIPAY_BATCH,
      'enc://payment-account',
    )

    gateway.execute.mockResolvedValueOnce({ code: '10000', fileId: 'FILE-1' })
    await expect(capabilities.receipt.apply('DETAIL-1')).resolves.toBe('FILE-1')
    expect(gateways.create).toHaveBeenCalledWith('enc://payment-account')
    expect(capabilities).toEqual(
      expect.objectContaining({
        batch: expect.any(Object),
        order: expect.any(Object),
        receipt: expect.any(Object),
      }),
    )
    expect(capabilities.reconciliation.batch).toEqual({
      enabled: true,
      initialDelaySeconds: 10,
      intervalSeconds: 5,
      maxAttempts: 12,
    })
    expect(capabilities.batch.getReconciliationPolicy()).toEqual(capabilities.reconciliation.batch)
    expect(factory.getReconciliationPolicies(PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER)).toEqual({
      batch: expect.objectContaining({ enabled: false }),
      order: expect.objectContaining({ enabled: false }),
    })
  })
})
