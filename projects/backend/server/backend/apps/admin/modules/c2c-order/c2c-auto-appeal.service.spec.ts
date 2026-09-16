import {
  BusinessStatus,
  MerchantOrderAutoAppealStatus,
  MerchantOrderSide,
  MerchantPlatform,
} from '@admin/database'
import { C2cBuyOrderStatus } from '../c2c-platform'
import {
  C2cAppealProcessingError,
  C2cAppealReasonRequiredError,
  C2cAppealSubmissionUncertainError,
  C2cAppealUpstreamStatusError,
} from './c2c-order-appeal.service'
import { C2cAutoAppealService } from './c2c-auto-appeal.service'

describe('C2cAutoAppealService', () => {
  const now = new Date('2026-09-16T08:00:00.000Z')
  const merchant = {
    id: 'merchant-1',
    tenantId: 'tenant-1',
    platform: MerchantPlatform.BINANCE,
    status: BusinessStatus.ACTIVE,
    autoAppealEnabled: true,
    autoAppealEnabledAt: new Date('2026-09-16T00:00:00.000Z'),
    autoAppealDelayMinutes: 18,
  }
  const order = {
    id: 'order-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    platformOrderId: 'BIN-1',
    autoAppealAttempts: 0,
    autoAppealNextAttemptAt: null,
  }
  const merchants = { find: jest.fn(), update: jest.fn() }
  const query = {
    innerJoin: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn(),
  }
  const orders = { createQueryBuilder: jest.fn(), update: jest.fn() }
  const appeals = { submitForAuto: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    merchants.find.mockResolvedValue([merchant])
    merchants.update.mockResolvedValue({ affected: 1 })
    Object.values(query).forEach((mock) => mock.mockReturnValue(query))
    query.getMany.mockResolvedValue([order])
    orders.createQueryBuilder.mockReturnValue(query)
    orders.update.mockResolvedValue({ affected: 1 })
    appeals.submitForAuto.mockResolvedValue({ complaintNo: 'CMP-1' })
  })

  function createService() {
    return new C2cAutoAppealService(merchants as never, orders as never, appeals as never)
  }

  it('submits the default Binance appeal and records the final state', async () => {
    await expect(createService().scanAll(now)).resolves.toEqual([
      expect.objectContaining({ candidates: 1, submitted: 1, retry: 0 }),
    ])
    expect(appeals.submitForAuto).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1')
    expect(query.andWhere).toHaveBeenCalledWith('payment_order.status = :paymentStatus', {
      paymentStatus: 'SUCCESS',
    })
    expect(query.andWhere).toHaveBeenCalledWith('merchant_order.side = :side', {
      side: MerchantOrderSide.BUY,
    })
    expect(query.andWhere).toHaveBeenCalledWith(
      'payment_order."platformConfirmStatus" = :platformConfirmStatus',
      { platformConfirmStatus: 'SUCCESS' },
    )
    expect(query.andWhere).toHaveBeenCalledWith(
      'payment_order."platformConfirmedAt" >= :enabledAt',
      { enabledAt: merchant.autoAppealEnabledAt },
    )
    expect(query.andWhere).toHaveBeenCalledWith(
      'payment_order."platformConfirmedAt" <= :paidBefore',
      { paidBefore: new Date('2026-09-16T07:42:00.000Z') },
    )
    expect(query.addSelect).toHaveBeenCalledWith('payment_order.platformConfirmedAt')
    expect(query.orderBy).toHaveBeenCalledWith('payment_order.platformConfirmedAt', 'ASC')
    expect(orders.update).toHaveBeenCalledWith(
      { id: 'order-1', tenantId: 'tenant-1', merchantId: 'merchant-1' },
      expect.objectContaining({
        autoAppealStatus: MerchantOrderAutoAppealStatus.SUBMITTED,
        autoAppealProcessedAt: now,
      }),
    )
    expect(merchants.update).toHaveBeenCalledWith(
      { id: 'merchant-1', tenantId: 'tenant-1' },
      { autoAppealLastScanAt: now, autoAppealLastError: null },
    )
  })

  it('requires manual selection when Binance does not provide reason code 1', async () => {
    appeals.submitForAuto.mockRejectedValue(
      new C2cAppealReasonRequiredError('BIN-1', [
        { reasonCode: 6, reasonDesc: '卖家收款后未放行' },
      ]),
    )

    const [result] = await createService().scanAll(now)

    expect(result).toEqual(expect.objectContaining({ manualRequired: 1, retry: 0 }))
    expect(orders.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        autoAppealStatus: MerchantOrderAutoAppealStatus.MANUAL_REQUIRED,
        autoAppealLastError: expect.stringContaining('6:卖家收款后未放行'),
      }),
    )
  })

  it('marks an upstream terminal order as skipped', async () => {
    appeals.submitForAuto.mockRejectedValue(
      new C2cAppealUpstreamStatusError(C2cBuyOrderStatus.COMPLETED),
    )

    const [result] = await createService().scanAll(now)

    expect(result).toEqual(expect.objectContaining({ skipped: 1, retry: 0 }))
    expect(orders.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        autoAppealStatus: MerchantOrderAutoAppealStatus.SKIPPED,
        autoAppealLastError: '上游订单已结束，状态：COMPLETED',
      }),
    )
  })

  it('does not retry an in-flight or uncertain submission', async () => {
    appeals.submitForAuto
      .mockRejectedValueOnce(new C2cAppealProcessingError())
      .mockRejectedValueOnce(new C2cAppealSubmissionUncertainError(new Error('timeout')))
    query.getMany.mockResolvedValueOnce([order]).mockResolvedValueOnce([order])

    const first = await createService().scanAll(now)
    const second = await createService().scanAll(now)

    expect(first[0]).toEqual(expect.objectContaining({ processing: 1, retry: 0 }))
    expect(second[0]).toEqual(expect.objectContaining({ processing: 1, retry: 0 }))
    expect(orders.update).not.toHaveBeenCalled()
  })

  it('backs off a transient failure and increments the persisted attempt count', async () => {
    appeals.submitForAuto.mockRejectedValue(new Error('temporary upstream failure'))

    const [result] = await createService().scanAll(now)

    expect(result).toEqual(expect.objectContaining({ retry: 1 }))
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', tenantId: 'tenant-1', merchantId: 'merchant-1' }),
      expect.objectContaining({
        autoAppealStatus: MerchantOrderAutoAppealStatus.RETRY,
        autoAppealAttempts: 1,
        autoAppealNextAttemptAt: new Date('2026-09-16T08:01:00.000Z'),
        autoAppealLastError: 'temporary upstream failure',
      }),
    )
  })

  it('only asks the repository for active auto-appeal Binance merchants', async () => {
    merchants.find.mockResolvedValue([])

    await expect(createService().scanAll(now)).resolves.toEqual([])
    expect(merchants.find).toHaveBeenCalledWith({
      where: {
        platform: MerchantPlatform.BINANCE,
        status: BusinessStatus.ACTIVE,
        autoAppealEnabled: true,
      },
    })
    expect(orders.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('isolates one merchant scan failure and continues with the remaining merchants', async () => {
    const secondMerchant = { ...merchant, id: 'merchant-2' }
    merchants.find.mockResolvedValue([merchant, secondMerchant])
    query.getMany
      .mockRejectedValueOnce(new Error('credential unavailable'))
      .mockResolvedValueOnce([order])

    await expect(createService().scanAll(now)).resolves.toEqual([
      expect.objectContaining({ merchantId: 'merchant-1', error: 'credential unavailable' }),
      expect.objectContaining({ merchantId: 'merchant-2', submitted: 1 }),
    ])
    expect(appeals.submitForAuto).toHaveBeenCalledTimes(1)
    expect(merchants.update).toHaveBeenCalledWith(
      { id: 'merchant-1', tenantId: 'tenant-1' },
      { autoAppealLastError: 'credential unavailable' },
    )
  })
})
