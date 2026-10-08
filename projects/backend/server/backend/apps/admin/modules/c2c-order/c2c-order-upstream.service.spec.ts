import { MerchantPlatform } from '@admin/database'
import { C2cOrderUpstreamService } from './c2c-order-upstream.service'

describe('C2cOrderUpstreamService', () => {
  const order = {
    id: 'order-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    platform: MerchantPlatform.BINANCE,
    platformOrderId: '22941455316514955264',
  }
  const orders = { findOne: jest.fn() }
  const merchants = { findOne: jest.fn() }
  const credentials = { getActiveReference: jest.fn() }
  const secrets = { resolve: jest.fn() }
  const factory = { create: jest.fn() }
  const platform = { getOrderDetailSnapshot: jest.fn() }
  const service = new C2cOrderUpstreamService(
    orders as never,
    merchants as never,
    credentials as never,
    secrets,
    factory as never,
    platform as never,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    orders.findOne.mockResolvedValue(order)
    merchants.findOne.mockResolvedValue({ id: 'merchant-1', platform: MerchantPlatform.BINANCE })
    credentials.getActiveReference.mockResolvedValue({ credentialRef: 'secret-reference' })
    secrets.resolve.mockResolvedValue({ apiKey: 'private-key' })
    factory.create.mockReturnValue({ apiKey: 'private-key' })
    platform.getOrderDetailSnapshot.mockResolvedValue({
      raw: {
        code: '000000',
        data: { orderNumber: order.platformOrderId, customField: 'original' },
      },
      normalized: { fiatAmount: '19647.00', payeeName: '收款人', status: 'PAID' },
      normalizationError: null,
    })
  })

  it('returns the original envelope and live normalization under tenant and merchant scope', async () => {
    const result = await service.query('tenant-1', 'merchant-1', 'order-1')
    expect(result).toMatchObject({
      platformOrderId: '22941455316514955264',
      raw: { data: { customField: 'original' } },
      normalized: { fiatAmount: '19647.00', status: 'PAID' },
      normalizationError: null,
    })
    expect(orders.findOne).toHaveBeenCalledWith({
      where: { id: 'order-1', tenantId: 'tenant-1', merchantId: 'merchant-1' },
    })
    expect(merchants.findOne).toHaveBeenCalledWith({
      where: { id: 'merchant-1', tenantId: 'tenant-1' },
    })
    expect(platform.getOrderDetailSnapshot).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      { apiKey: 'private-key' },
      '22941455316514955264',
    )
  })

  it('does not contact upstream for an order outside the requested scope', async () => {
    orders.findOne.mockResolvedValue(null)
    await expect(service.query('tenant-other', 'merchant-1', 'order-1')).rejects.toThrow(
      '商家订单不存在',
    )
    expect(credentials.getActiveReference).not.toHaveBeenCalled()
    expect(platform.getOrderDetailSnapshot).not.toHaveBeenCalled()
  })

  it('preserves business details while excluding nested authentication fields', async () => {
    platform.getOrderDetailSnapshot.mockResolvedValue({
      raw: { data: [{ payeeIdentity: '18516970120', apiKey: 'secret', token: 'secret-token' }] },
      normalized: null,
      normalizationError: '币安数字资产为空',
    })
    const result = await service.query('tenant-1', 'merchant-1', 'order-1')
    expect(result.raw).toEqual({
      data: [{ payeeIdentity: '18516970120', apiKey: '<REDACTED>', token: '<REDACTED>' }],
    })
    expect(result.normalizationError).toBe('币安数字资产为空')
    expect(result.normalized).toBeNull()
  })
})
