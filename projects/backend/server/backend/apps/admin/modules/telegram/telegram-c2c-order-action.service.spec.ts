import { BusinessStatus, MerchantEntity, PlatformConfirmationStatus } from '@admin/database'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { C2cMerchantPaymentService } from '../payment/c2c-merchant-payment.service'
import { TelegramC2cOrderActionService } from './telegram-c2c-order-action.service'

describe('TelegramC2cOrderActionService', () => {
  const merchants = { findOne: jest.fn() }
  const payments = { createAfterManualReview: jest.fn(), cancel: jest.fn(), confirmPaid: jest.fn() }
  let service: TelegramC2cOrderActionService

  beforeEach(async () => {
    jest.clearAllMocks()
    merchants.findOne.mockResolvedValue({
      id: 'merchant-1',
      tenantId: 'tenant-1',
      status: BusinessStatus.ACTIVE,
    })
    payments.createAfterManualReview.mockResolvedValue({
      paymentNo: 'PAY-1',
      status: 'READY',
    })
    payments.cancel.mockResolvedValue({ platformOrderId: 'BN-1', status: 'CANCELLED' })
    payments.confirmPaid.mockResolvedValue({
      paymentNo: 'PAY-1',
      sourceBusinessNo: 'BN-1',
      status: 'SUCCESS',
      platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
      platformConfirmLastError: null,
    })
    const module = await Test.createTestingModule({
      providers: [
        TelegramC2cOrderActionService,
        { provide: getRepositoryToken(MerchantEntity), useValue: merchants },
        { provide: C2cMerchantPaymentService, useValue: payments },
      ],
    }).compile()
    service = module.get(TelegramC2cOrderActionService)
  })

  it('lets the payment plan decide the execution mode when confirming a reviewed order', async () => {
    await expect(
      service.confirm({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        orderId: 'order-1',
        operator: 'TG:88',
      }),
    ).resolves.toMatchObject({
      parseMode: 'HTML',
      text: expect.stringContaining('<b>C2C订单已创建</b>'),
    })

    expect(merchants.findOne).toHaveBeenCalledWith({
      where: { id: 'merchant-1', tenantId: 'tenant-1', status: BusinessStatus.ACTIVE },
    })
    expect(payments.createAfterManualReview).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'order-1',
      'TG:88',
    )
  })

  it('cancels only through the scoped merchant payment service', async () => {
    await expect(
      service.cancel({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        orderId: 'order-1',
        operator: 'TG:88',
      }),
    ).resolves.toMatchObject({
      parseMode: 'HTML',
      text: expect.stringContaining('<b>C2C订单已作废</b>'),
    })

    expect(payments.cancel).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'order-1',
      'TG:88',
      'Telegram 人工作废',
    )
  })

  it('reports mark-paid success from the platform confirmation state', async () => {
    await expect(
      service.retryConfirmPaid({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        orderId: 'order-1',
        operator: 'TG:88',
      }),
    ).resolves.toMatchObject({
      parseMode: 'HTML',
      text: expect.stringContaining('<b>C2C 标记付款成功</b>'),
    })
    expect(payments.confirmPaid).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1')
  })
})
