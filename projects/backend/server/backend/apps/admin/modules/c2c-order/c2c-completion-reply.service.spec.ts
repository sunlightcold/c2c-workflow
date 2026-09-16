import {
  BusinessStatus,
  MerchantOrderCompletionReplyStatus,
  MerchantOrderStatus,
  MerchantPlatform,
} from '@admin/database'
import { C2cBuyOrderStatus } from '../c2c-platform'
import { C2cCompletionReplyService } from './c2c-completion-reply.service'

describe('C2cCompletionReplyService', () => {
  const now = new Date('2026-09-16T08:00:00.000Z')
  const merchant = {
    id: 'merchant-1',
    tenantId: 'tenant-1',
    platform: MerchantPlatform.BINANCE,
    status: BusinessStatus.ACTIVE,
    c2cChatOrderCompletedEnabled: true,
    c2cChatOrderCompletedEnabledAt: new Date('2026-09-16T00:00:00.000Z'),
  }
  const completedOrder = {
    id: 'order-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    platformOrderId: 'BIN-1',
    platformCreatedAt: new Date('2026-09-16T01:00:00.000Z'),
    platformStatus: C2cBuyOrderStatus.COMPLETED,
    status: MerchantOrderStatus.COMPLETED,
    completionReplyAttempts: 0,
  }
  const selectQuery = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn(),
  }
  const updateQuery = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn(),
  }
  const merchants = { find: jest.fn(), findOne: jest.fn() }
  const orders = { createQueryBuilder: jest.fn(), update: jest.fn() }
  const orderTxRepository = { findOne: jest.fn(), save: jest.fn() }
  const historyTxRepository = { save: jest.fn() }
  const dataSource = {
    transaction: jest.fn((work) =>
      work({
        getRepository: (entity: { name?: string }) =>
          entity.name === 'MerchantOrderEntity' ? orderTxRepository : historyTxRepository,
      }),
    ),
  }
  const credentials = { getActiveReference: jest.fn() }
  const secrets = { resolve: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const platformClient = { getOrderDetail: jest.fn() }
  const platformChat = { sendOrderCompletedStrict: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(selectQuery).forEach((mock) => mock.mockReturnValue(selectQuery))
    Object.values(updateQuery).forEach((mock) => mock.mockReturnValue(updateQuery))
    merchants.find.mockResolvedValue([merchant])
    merchants.findOne.mockResolvedValue(merchant)
    selectQuery.getMany.mockResolvedValue([completedOrder])
    updateQuery.execute.mockResolvedValue({ affected: 1 })
    orders.createQueryBuilder.mockImplementation((alias?: string) =>
      alias ? selectQuery : updateQuery,
    )
    orders.update.mockResolvedValue({ affected: 1 })
    credentials.getActiveReference.mockResolvedValue({ credentialRef: 'enc://secret' })
    secrets.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentialFactory.create.mockReturnValue({ apiKey: 'key', secretKey: 'secret' })
    platformChat.sendOrderCompletedStrict.mockResolvedValue(undefined)
    orderTxRepository.findOne.mockResolvedValue({ ...completedOrder })
    orderTxRepository.save.mockImplementation((value) => Promise.resolve(value))
    historyTxRepository.save.mockImplementation((value) => Promise.resolve(value))
  })

  function createService() {
    return new C2cCompletionReplyService(
      merchants as never,
      orders as never,
      dataSource as never,
      credentials as never,
      secrets as never,
      credentialFactory as never,
      platformClient as never,
      platformChat as never,
    )
  }

  it('claims and sends a completed reply exactly once', async () => {
    const service = createService()

    await service.sendCompletedOrders('tenant-1', 'merchant-1', ['order-1'], now)
    updateQuery.execute.mockResolvedValueOnce({ affected: 0 })
    await service.sendCompletedOrders('tenant-1', 'merchant-1', ['order-1'], now)

    expect(platformChat.sendOrderCompletedStrict).toHaveBeenCalledTimes(1)
    expect(platformChat.sendOrderCompletedStrict).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'order-1',
    )
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-1',
        completionReplyStatus: MerchantOrderCompletionReplyStatus.SENDING,
      }),
      expect.objectContaining({
        completionReplyStatus: MerchantOrderCompletionReplyStatus.SENT,
        completionReplySentAt: now,
      }),
    )
  })

  it('backs off a failed Telegram chat delivery', async () => {
    platformChat.sendOrderCompletedStrict.mockRejectedValue(new Error('socket unavailable'))

    await createService().sendCompletedOrders('tenant-1', 'merchant-1', ['order-1'], now)

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        completionReplyStatus: MerchantOrderCompletionReplyStatus.SENDING,
      }),
      expect.objectContaining({
        completionReplyStatus: MerchantOrderCompletionReplyStatus.FAILED,
        completionReplyNextRetryAt: new Date('2026-09-16T08:01:00.000Z'),
        completionReplyLastError: 'socket unavailable',
      }),
    )
  })

  it('queries old pending-release orders and skips an upstream cancellation permanently', async () => {
    selectQuery.getMany.mockResolvedValue([
      { ...completedOrder, status: MerchantOrderStatus.PENDING_RELEASE },
    ])
    platformClient.getOrderDetail.mockResolvedValue({
      platformOrderId: 'BIN-1',
      status: C2cBuyOrderStatus.CANCELLED,
    })

    const [result] = await createService().scanAll(now)

    expect(result).toEqual(expect.objectContaining({ checked: 1, skipped: 1, sent: 0 }))
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', tenantId: 'tenant-1', merchantId: 'merchant-1' }),
      expect.objectContaining({
        completionReplyStatus: MerchantOrderCompletionReplyStatus.SKIPPED,
        completionReplyLastError: expect.stringContaining('CANCELLED'),
      }),
    )
    expect(platformChat.sendOrderCompletedStrict).not.toHaveBeenCalled()
  })

  it('persists an upstream completion and then sends the configured reply', async () => {
    selectQuery.getMany.mockResolvedValue([
      { ...completedOrder, status: MerchantOrderStatus.PENDING_RELEASE },
    ])
    platformClient.getOrderDetail.mockResolvedValue({
      platformOrderId: 'BIN-1',
      status: C2cBuyOrderStatus.COMPLETED,
    })
    orderTxRepository.findOne.mockResolvedValue({
      ...completedOrder,
      status: MerchantOrderStatus.PENDING_RELEASE,
    })

    const [result] = await createService().scanAll(now)

    expect(result).toEqual(expect.objectContaining({ checked: 1, sent: 1, failed: 0 }))
    expect(orderTxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MerchantOrderStatus.COMPLETED,
        platformStatus: C2cBuyOrderStatus.COMPLETED,
      }),
    )
    expect(historyTxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'COMPLETION_REPLY_SCAN' }),
    )
  })

  it('does not scan OKX or disabled merchants', async () => {
    merchants.find.mockResolvedValue([])

    await expect(createService().scanAll(now)).resolves.toEqual([])
    expect(merchants.find).toHaveBeenCalledWith({
      where: {
        platform: MerchantPlatform.BINANCE,
        status: BusinessStatus.ACTIVE,
        c2cChatOrderCompletedEnabled: true,
      },
    })
    expect(orders.createQueryBuilder).not.toHaveBeenCalled()
  })
})
