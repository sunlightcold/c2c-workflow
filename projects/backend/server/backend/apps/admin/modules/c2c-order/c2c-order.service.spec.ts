import {
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
} from '@admin/database'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { DataSource, In } from 'typeorm'
import { C2cOrderService } from './c2c-order.service'

describe('C2cOrderService', () => {
  const orderRepository = { findAndCount: jest.fn(), findOne: jest.fn() }
  const historyRepository = { find: jest.fn() }
  const paymentRepository = { find: jest.fn() }
  const paymentHistoryRepository = { find: jest.fn() }
  let service: C2cOrderService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        C2cOrderService,
        { provide: getRepositoryToken(MerchantOrderEntity), useValue: orderRepository },
        {
          provide: getRepositoryToken(MerchantOrderStatusHistoryEntity),
          useValue: historyRepository,
        },
        { provide: getRepositoryToken(PaymentOrderEntity), useValue: paymentRepository },
        {
          provide: getRepositoryToken(PaymentOrderStatusHistoryEntity),
          useValue: paymentHistoryRepository,
        },
        { provide: DataSource, useValue: {} },
      ],
    }).compile()
    service = module.get(C2cOrderService)
  })

  it('filters one merchant scope and attaches the related payment summary', async () => {
    orderRepository.findAndCount.mockResolvedValue([
      [{ id: 'order-1', merchantId: 'merchant-1', platformOrderId: 'platform-1' }],
      1,
    ])
    paymentRepository.find.mockResolvedValue([
      {
        id: 'payment-1',
        merchantId: 'merchant-1',
        sourceBusinessNo: 'platform-1',
        status: 'READY',
      },
    ])

    await expect(
      service.list('tenant-1', {
        merchantId: 'merchant-1',
        platformOrderId: 'platform',
        paymentMethod: 'ALIPAY',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: 'order-1',
          paymentOrder: { id: 'payment-1', status: 'READY' },
        },
      ],
    })
    expect(paymentRepository.find).toHaveBeenCalledWith({
      where: {
        merchantId: 'merchant-1',
        sourceBusinessNo: In(['platform-1']),
        sourceType: PaymentSourceType.C2C_BUY,
        tenantId: 'tenant-1',
      },
    })
  })

  it('lists all merchant orders in the tenant when merchant filter is omitted', async () => {
    orderRepository.findAndCount.mockResolvedValue([
      [
        { id: 'order-1', merchantId: 'merchant-1', platformOrderId: 'shared-platform-id' },
        { id: 'order-2', merchantId: 'merchant-2', platformOrderId: 'shared-platform-id' },
      ],
      2,
    ])
    paymentRepository.find.mockResolvedValue([
      {
        id: 'payment-1',
        merchantId: 'merchant-1',
        sourceBusinessNo: 'shared-platform-id',
      },
      {
        id: 'payment-2',
        merchantId: 'merchant-2',
        sourceBusinessNo: 'shared-platform-id',
      },
    ])

    await expect(service.list('tenant-1', { page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [
        { id: 'order-1', paymentOrder: { id: 'payment-1' } },
        { id: 'order-2', paymentOrder: { id: 'payment-2' } },
      ],
      total: 2,
    })
    expect(orderRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
    )
    expect(paymentRepository.find).toHaveBeenCalledWith({
      where: {
        sourceBusinessNo: In(['shared-platform-id', 'shared-platform-id']),
        sourceType: PaymentSourceType.C2C_BUY,
        tenantId: 'tenant-1',
      },
    })
  })

  it('returns merchant and payment histories in the order detail', async () => {
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      platformOrderId: 'platform-1',
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
    })
    paymentRepository.find.mockResolvedValue([{ id: 'payment-1' }])
    historyRepository.find.mockResolvedValue([{ id: 'merchant-history-1' }])
    paymentHistoryRepository.find.mockResolvedValue([{ id: 'payment-history-1' }])

    await expect(service.detail('tenant-1', 'merchant-1', 'order-1')).resolves.toMatchObject({
      paymentOrder: {
        id: 'payment-1',
        history: [{ id: 'payment-history-1' }],
      },
      history: [{ id: 'merchant-history-1' }],
    })
  })
})
