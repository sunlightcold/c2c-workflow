import { BusinessStatus, MerchantOrderStatus, MerchantPlatform } from '@admin/database'
import { C2cPlatformChatService } from './c2c-platform-chat.service'

describe('C2cPlatformChatService', () => {
  const merchant = {
    id: 'merchant-1',
    tenantId: 'tenant-1',
    platform: MerchantPlatform.BINANCE,
    status: BusinessStatus.ACTIVE,
    c2cChatOrderCreatedEnabled: true,
    c2cChatOrderCreatedMessage: '订单已创建',
    c2cChatOrderPaidEnabled: true,
    c2cChatOrderPaidMessage: '订单已付款',
    c2cChatOrderCompletedEnabled: true,
    c2cChatOrderCompletedMessage: '订单已完成',
  }
  const order = {
    id: 'order-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    platformOrderId: 'BIN-1',
    status: MerchantOrderStatus.PENDING_RELEASE,
  }
  const merchants = { findOne: jest.fn() }
  const orders = { findOne: jest.fn() }
  const credentialService = { getActiveReference: jest.fn() }
  const secretResolver = { resolve: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const platformClient = { getCapabilities: jest.fn(), sendChatText: jest.fn() }
  let service: C2cPlatformChatService

  beforeEach(() => {
    jest.clearAllMocks()
    merchants.findOne.mockResolvedValue(merchant)
    orders.findOne.mockResolvedValue(order)
    credentialService.getActiveReference.mockResolvedValue({
      credentialRef: 'env://BINANCE',
      clientType: 'WEB',
      requestTimeoutMs: 5000,
    })
    secretResolver.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentialFactory.create.mockReturnValue({
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
    })
    platformClient.getCapabilities.mockReturnValue({ chat: true })
    platformClient.sendChatText.mockResolvedValue(undefined)
    service = new C2cPlatformChatService(
      merchants as never,
      orders as never,
      credentialService as never,
      secretResolver,
      credentialFactory as never,
      platformClient as never,
    )
  })

  it('sends configured Binance messages with the active platform credential', async () => {
    await service.sendOrderCreated('tenant-1', 'merchant-1', 'order-1')
    await service.sendOrderPaid('tenant-1', 'merchant-1', 'order-1')

    expect(platformClient.sendChatText).toHaveBeenNthCalledWith(
      1,
      MerchantPlatform.BINANCE,
      expect.objectContaining({ apiKey: 'key' }),
      'BIN-1',
      '订单已创建',
    )
    expect(platformClient.sendChatText).toHaveBeenNthCalledWith(
      2,
      MerchantPlatform.BINANCE,
      expect.objectContaining({ apiKey: 'key' }),
      'BIN-1',
      '订单已付款',
    )
  })

  it('does not resolve credentials for unsupported OKX chat', async () => {
    merchants.findOne.mockResolvedValue({ ...merchant, platform: MerchantPlatform.OKX })
    platformClient.getCapabilities.mockReturnValue({ chat: false })

    await expect(
      service.sendOrderPaid('tenant-1', 'merchant-1', 'order-1'),
    ).resolves.toBeUndefined()

    expect(credentialService.getActiveReference).not.toHaveBeenCalled()
    expect(platformClient.sendChatText).not.toHaveBeenCalled()
  })

  it('keeps chat transport failures outside the payment state machine', async () => {
    platformClient.sendChatText.mockRejectedValue(new Error('socket unavailable'))

    await expect(
      service.sendOrderPaid('tenant-1', 'merchant-1', 'order-1'),
    ).resolves.toBeUndefined()
  })

  it('sends completion text only for orders that actually became completed', async () => {
    orders.findOne
      .mockResolvedValueOnce({ ...order, status: MerchantOrderStatus.COMPLETED })
      .mockResolvedValueOnce({ ...order, status: MerchantOrderStatus.PENDING_RELEASE })

    await service.sendCompletedOrders('tenant-1', 'merchant-1', ['completed', 'pending'])

    expect(platformClient.sendChatText).toHaveBeenCalledTimes(1)
    expect(platformClient.sendChatText).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      expect.anything(),
      'BIN-1',
      '订单已完成',
    )
  })
})
