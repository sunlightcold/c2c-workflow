import { BusinessStatus, MerchantPlatform } from '@admin/database'
import { C2cOrderSyncService } from './c2c-order-sync.service'

describe('C2cOrderSyncService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const now = new Date('2026-09-10T05:00:00.000Z')
  const merchantRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: merchantId,
      tenantId,
      platform: MerchantPlatform.BINANCE,
      status: BusinessStatus.ACTIVE,
      pageSize: 20,
      overlapSeconds: 120,
      orderStatusList: [1],
    }),
  }
  const credentials = {
    getActiveReference: jest.fn().mockResolvedValue({
      credentialRef: 'env://C2C_BINANCE_M1',
      clientType: 'WEB',
      xUserId: null,
      requestTimeoutMs: 5000,
    }),
  }
  const secretResolver = {
    resolve: jest.fn().mockResolvedValue({ apiKey: 'key', secretKey: 'secret' }),
  }
  const credentialFactory = {
    create: jest.fn().mockReturnValue({
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
    }),
  }
  const store = {
    claimDue: jest.fn(),
    getLastSuccessAt: jest.fn().mockResolvedValue(null),
    persistWindow: jest.fn().mockResolvedValue({ created: 1, updated: 0 }),
    recordFailure: jest.fn().mockResolvedValue(undefined),
  }
  const binance = { listOrders: jest.fn(), getOrderDetail: jest.fn() }
  const okx = { listOrders: jest.fn(), getOrderDetail: jest.fn() }
  const eventEmitter = { emit: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('persists all pages and advances the checkpoint only after every detail succeeds', async () => {
    binance.listOrders
      .mockResolvedValueOnce({
        items: [
          {
            platformOrderId: 'BIN-1',
            side: 'BUY',
            status: 'PENDING_PAYMENT',
            asset: 'USDT',
            assetAmount: '10',
            fiatCurrency: 'CNY',
            fiatAmount: '70',
            createdAt: '2026-09-10T04:50:00.000Z',
          },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            platformOrderId: 'BIN-2',
            side: 'BUY',
            status: 'COMPLETED',
            asset: 'USDT',
            assetAmount: '20',
            fiatCurrency: 'CNY',
            fiatAmount: '140',
            createdAt: '2026-09-10T04:51:00.000Z',
          },
        ],
        total: 2,
      })
    binance.getOrderDetail.mockImplementation((_credential, id) =>
      Promise.resolve({
        platformOrderId: id,
        side: 'BUY',
        status: id === 'BIN-1' ? 'PENDING_PAYMENT' : 'COMPLETED',
        asset: 'USDT',
        assetAmount: null,
        fiatCurrency: 'CNY',
        fiatAmount: id === 'BIN-1' ? '70' : '140',
        createdAt: '2026-09-10T04:50:00.000Z',
        platformPaymentMethodId: '2',
        paymentMethod: 'ALIPAY',
        payeeIdentity: 'payee@example.com',
        payeeName: 'Zhang San',
        identityName: 'Zhang San',
        payable: id === 'BIN-1',
        paymentDeadline: '2026-09-10T05:10:00.000Z',
      }),
    )
    const service = new C2cOrderSyncService(
      merchantRepository as never,
      credentials as never,
      secretResolver,
      credentialFactory as never,
      binance as never,
      okx as never,
      store,
      eventEmitter as never,
    )

    await expect(service.sync(tenantId, merchantId, now)).resolves.toEqual({
      scanned: 2,
      created: 1,
      updated: 0,
    })
    expect(binance.listOrders).toHaveBeenCalledTimes(2)
    expect(okx.listOrders).not.toHaveBeenCalled()
    expect(store.persistWindow).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, merchantId, platform: MerchantPlatform.BINANCE }),
      expect.arrayContaining([
        expect.objectContaining({ platformOrderId: 'BIN-1', assetAmount: '10' }),
      ]),
      now,
    )
    expect(store.recordFailure).not.toHaveBeenCalled()
  })

  it('records a failed attempt without asking the store to advance the successful window', async () => {
    binance.listOrders.mockRejectedValue(new Error('upstream unavailable'))
    const service = new C2cOrderSyncService(
      merchantRepository as never,
      credentials as never,
      secretResolver,
      credentialFactory as never,
      binance as never,
      okx as never,
      store,
      eventEmitter as never,
    )

    await expect(service.sync(tenantId, merchantId, now)).rejects.toThrow('upstream unavailable')
    expect(store.persistWindow).not.toHaveBeenCalled()
    expect(store.recordFailure).toHaveBeenCalledWith(
      tenantId,
      merchantId,
      now,
      'upstream unavailable',
    )
  })
})
