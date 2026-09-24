import {
  MerchantEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { PAYMENT_PLAN_RESOLVER } from './payment-plan-resolver'
import type { PaymentOrderListDto } from './payment-order.dto'
import { PaymentOrderService } from './payment-order.service'

describe('PaymentOrderService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const input = {
    merchantId,
    sourceType: PaymentSourceType.BOT_MANUAL,
    sourceBusinessNo: 'manual-1',
    amount: '100.00',
    currency: 'CNY',
    paymentMethod: 'ALIPAY',
    executionMode: PaymentExecutionMode.BATCH,
    payeeIdentity: 'payee@example.com',
    payeeName: 'Payee',
  }
  const orders = {
    create: jest.fn((value) => value),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
  }
  const batchItems = { find: jest.fn() }
  const batches = { find: jest.fn() }
  const manager = {
    findOne: jest.fn((_entity: unknown, options: unknown) => orders.findOne(options)),
    save: jest.fn(async (_entity: unknown, value: object) => ({ id: 'order-1', ...value })),
    insert: jest.fn(),
  }
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === PaymentBatchItemEntity) return batchItems
      if (entity === PaymentBatchEntity) return batches
      throw new Error('Unexpected repository')
    }),
    query: jest.fn(),
    transaction: jest.fn((callback: (value: typeof manager) => unknown) => callback(manager)),
  }
  const merchants = { findOne: jest.fn() }
  const resolver = { resolve: jest.fn() }
  let service: PaymentOrderService

  beforeEach(async () => {
    jest.clearAllMocks()
    dataSource.transaction.mockImplementation((callback) => callback(manager))
    merchants.findOne.mockResolvedValue({ id: merchantId, tenantId, status: 'active' })
    orders.findOne.mockResolvedValue(null)
    batchItems.find.mockResolvedValue([])
    batches.find.mockResolvedValue([])
    const module = await Test.createTestingModule({
      providers: [
        PaymentOrderService,
        { provide: getRepositoryToken(PaymentOrderEntity), useValue: orders },
        { provide: getRepositoryToken(MerchantEntity), useValue: merchants },
        { provide: PAYMENT_PLAN_RESOLVER, useValue: resolver },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile()
    service = module.get(PaymentOrderService)
  })

  it('creates a ready order with one locked account-channel route', async () => {
    resolver.resolve.mockResolvedValue({
      planId: 'plan-1',
      paymentAccountId: 'account-1',
      paymentAccountChannelId: 'account-channel-1',
      adapterCode: 'ALIPAY_BATCH',
      executionMode: PaymentExecutionMode.BATCH,
    })

    await expect(service.create(tenantId, input)).resolves.toMatchObject({
      paymentNo: expect.stringMatching(/^PAY\d{20}$/),
      status: PaymentOrderStatus.READY,
      paymentPlanId: 'plan-1',
      paymentAccountId: 'account-1',
      paymentAccountChannelId: 'account-channel-1',
    })
  })

  it('derives the execution mode from the selected payment plan', async () => {
    resolver.resolve.mockResolvedValue({
      planId: 'plan-1',
      batchPolicyId: null,
      paymentAccountId: 'account-1',
      paymentAccountChannelId: 'account-channel-1',
      adapterCode: 'ALIPAY_MERCHANT_TRANSFER',
      executionMode: PaymentExecutionMode.INSTANT,
    })
    const { executionMode: _executionMode, ...withoutMode } = input

    await expect(
      service.create(tenantId, withoutMode, { requireRoute: true }),
    ).resolves.toMatchObject({ executionMode: PaymentExecutionMode.INSTANT })
    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ executionMode: undefined }),
    )
  })

  it('does not create a merchant payment order when no usable plan is available', async () => {
    resolver.resolve.mockResolvedValue(null)
    const { executionMode: _executionMode, ...withoutMode } = input

    await expect(service.create(tenantId, withoutMode, { requireRoute: true })).rejects.toThrow(
      '未匹配到可用的支付方案',
    )
    expect(manager.save).not.toHaveBeenCalled()
  })

  it('creates a pending-config order when no complete route is available', async () => {
    resolver.resolve.mockResolvedValue(null)

    await expect(service.create(tenantId, input)).resolves.toMatchObject({
      status: PaymentOrderStatus.PENDING_CONFIG,
      paymentPlanId: null,
      paymentAccountId: null,
      paymentAccountChannelId: null,
    })
  })

  it('returns the existing order for the same tenant merchant source and business number', async () => {
    orders.findOne.mockResolvedValue({ id: 'existing', status: PaymentOrderStatus.READY, ...input })

    await expect(service.create(tenantId, input)).resolves.toMatchObject({ id: 'existing' })
    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(manager.save).not.toHaveBeenCalled()
  })

  it('normalizes equivalent CNY amount strings before idempotency comparison', async () => {
    orders.findOne.mockResolvedValue({
      id: 'existing',
      status: PaymentOrderStatus.READY,
      ...input,
      amount: '100.00',
    })

    await expect(service.create(tenantId, { ...input, amount: '100' })).resolves.toMatchObject({
      id: 'existing',
    })
  })

  it('recognizes a stored amount with extra trailing zeros as the same payment intent', async () => {
    orders.findOne.mockResolvedValue({
      id: 'existing',
      status: PaymentOrderStatus.READY,
      ...input,
      amount: '100.00000000',
    })

    await expect(service.create(tenantId, input)).resolves.toMatchObject({ id: 'existing' })
    expect(manager.save).not.toHaveBeenCalled()
  })

  it('rejects reuse of a source business number with different payment details', async () => {
    orders.findOne.mockResolvedValue({
      id: 'existing',
      status: PaymentOrderStatus.READY,
      ...input,
      amount: '99.00',
    })

    await expect(service.create(tenantId, input)).rejects.toBeInstanceOf(ConflictException)
  })

  it('rejects currencies not supported by the current Alipay channels', async () => {
    await expect(service.create(tenantId, { ...input, currency: 'USD' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(resolver.resolve).not.toHaveBeenCalled()
  })

  it('rejects a merchant outside the current tenant', async () => {
    merchants.findOne.mockResolvedValue(null)

    await expect(service.create(tenantId, input)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('filters batch candidates by tenant and execution mode', async () => {
    orders.findAndCount.mockResolvedValue([[], 0])
    const query: PaymentOrderListDto = {
      executionMode: PaymentExecutionMode.BATCH,
      page: 1,
      pageSize: 100,
    }

    await service.list(tenantId, query)

    expect(orders.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          executionMode: PaymentExecutionMode.BATCH,
        },
      }),
    )
  })

  it('searches payment, system, platform, and batch order numbers within the tenant', async () => {
    batches.find.mockResolvedValue([{ id: 'batch-1' }])
    batchItems.find.mockResolvedValue([{ paymentOrderId: 'order-from-batch' }])
    orders.findAndCount.mockResolvedValue([[], 0])

    await service.list(tenantId, {
      merchantId,
      orderNo: 'ORDER-REFERENCE-1',
      page: 1,
      pageSize: 20,
    })

    expect(batches.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchNo: 'ORDER-REFERENCE-1', tenantId },
      }),
    )
    expect(batchItems.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { paymentOrderId: true },
        where: expect.objectContaining({ tenantId }),
      }),
    )
    expect(orders.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { merchantId, paymentNo: 'ORDER-REFERENCE-1', tenantId },
          { merchantId, sourceBusinessNo: 'ORDER-REFERENCE-1', tenantId },
          { merchantId, tenantId, upstreamId: 'ORDER-REFERENCE-1' },
          { id: expect.anything(), merchantId, tenantId },
        ],
      }),
    )
  })

  it('includes the latest payment batch number in the order list', async () => {
    orders.findAndCount.mockResolvedValue([
      [
        { id: 'order-1', merchantId, tenantId },
        { id: 'order-2', merchantId, tenantId },
      ],
      2,
    ])
    batchItems.find.mockResolvedValue([
      { batchId: 'batch-latest', paymentOrderId: 'order-1' },
      { batchId: 'batch-previous', paymentOrderId: 'order-1' },
    ])
    batches.find.mockResolvedValue([
      { batchNo: 'BATCH-LATEST', id: 'batch-latest' },
      { batchNo: 'BATCH-PREVIOUS', id: 'batch-previous' },
    ])

    await expect(service.list(tenantId, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [
        { batchNo: 'BATCH-LATEST', id: 'order-1' },
        { batchNo: null, id: 'order-2' },
      ],
      total: 2,
    })
  })

  it('returns tenant-scoped daily statistics using aggregate order filters', async () => {
    dataSource.query.mockResolvedValue([
      {
        todayPendingAmount: '88.1',
        todayPendingCount: '2',
        todaySuccessAmount: '300',
        todaySuccessCount: '4',
        yesterdaySuccessAmount: '120.25',
        yesterdaySuccessCount: '2',
      },
    ])

    await expect(
      service.statistics(tenantId, {
        executionMode: PaymentExecutionMode.BATCH,
        merchantId,
        orderNo: 'ORDER-1',
        sourceType: PaymentSourceType.C2C_BUY,
      }),
    ).resolves.toEqual({
      todayPending: { amount: '88.10', count: 2 },
      todaySuccess: { amount: '300.00', count: 4 },
      yesterdaySuccess: { amount: '120.25', count: 2 },
    })

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('payment_batch_item'),
      expect.arrayContaining([
        tenantId,
        merchantId,
        PaymentExecutionMode.BATCH,
        PaymentSourceType.C2C_BUY,
        'ORDER-1',
      ]),
    )
  })

  it('rematches only pending-config orders and locks the newly available route', async () => {
    orders.findOne.mockResolvedValue({
      id: 'order-1',
      tenantId,
      merchantId,
      sourceType: input.sourceType,
      sourceBusinessNo: input.sourceBusinessNo,
      amount: input.amount,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      executionMode: input.executionMode,
      status: PaymentOrderStatus.PENDING_CONFIG,
    })
    resolver.resolve.mockResolvedValue({
      planId: 'plan-1',
      paymentAccountId: 'account-1',
      paymentAccountChannelId: 'account-channel-1',
      adapterCode: 'ALIPAY_BATCH',
      executionMode: PaymentExecutionMode.BATCH,
    })

    await expect(service.rematch(tenantId, 'order-1')).resolves.toMatchObject({
      status: PaymentOrderStatus.READY,
      paymentPlanId: 'plan-1',
    })
  })
})
