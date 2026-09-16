import {
  MerchantOrderStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
  PlatformConfirmationStatus,
} from '@admin/database'
import { BadRequestException, ConflictException } from '@nestjs/common'
import type { C2cOrderService } from '../c2c-order/c2c-order.service'
import { C2cMerchantPaymentService } from './c2c-merchant-payment.service'
import type { C2cPaymentCancellationService } from './c2c-payment-cancellation.service'
import type { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import type { PaymentOrderService } from './payment-order.service'

describe('C2cMerchantPaymentService', () => {
  const order = {
    id: 'order-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    platformOrderId: 'platform-order-1',
    status: MerchantOrderStatus.PENDING_PAYMENT,
    payable: true,
    identityMatched: true,
    fiatAmount: '100.00',
    fiatCurrency: 'CNY',
    paymentMethod: 'ALIPAY',
    payeeIdentity: 'payee@example.com',
    payeeName: 'Payee',
    identityName: 'Verified Payee',
  }
  const merchantOrders = { detail: jest.fn() }
  const paymentOrders = { create: jest.fn(), detail: jest.fn() }
  const cancellation = { cancel: jest.fn() }
  const execution = { confirmPlatform: jest.fn(), submit: jest.fn() }
  const platformChat = { sendOrderCreated: jest.fn() }
  let service: C2cMerchantPaymentService

  beforeEach(() => {
    jest.clearAllMocks()
    merchantOrders.detail.mockResolvedValue(order)
    paymentOrders.create.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.READY,
      executionMode: PaymentExecutionMode.INSTANT,
    })
    paymentOrders.detail.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.COMPLETED,
    })
    execution.submit.mockResolvedValue({ id: 'payment-1', status: PaymentOrderStatus.COMPLETED })
    cancellation.cancel.mockResolvedValue(undefined)
    platformChat.sendOrderCreated.mockResolvedValue(undefined)
    service = new C2cMerchantPaymentService(
      merchantOrders as unknown as C2cOrderService,
      paymentOrders as unknown as PaymentOrderService,
      execution as unknown as PaymentExecutionCoordinator,
      cancellation as unknown as C2cPaymentCancellationService,
      platformChat as never,
    )
  })

  it('creates an instant payment from trusted merchant-order fields and submits it', async () => {
    await expect(service.create('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      id: 'payment-1',
      status: PaymentOrderStatus.COMPLETED,
    })

    expect(paymentOrders.create).toHaveBeenCalledWith(
      'tenant-1',
      {
        merchantId: 'merchant-1',
        sourceType: PaymentSourceType.C2C_BUY,
        sourceBusinessNo: 'platform-order-1',
        amount: '100.00',
        currency: 'CNY',
        paymentMethod: 'ALIPAY',
        payeeIdentity: 'payee@example.com',
        payeeName: 'Verified Payee',
      },
      {
        automaticOnly: false,
        requireRoute: true,
      },
    )
    expect(execution.submit).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(platformChat.sendOrderCreated).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1')
    expect(paymentOrders.detail).toHaveBeenCalledWith('tenant-1', 'payment-1')
  })

  it('creates a batch payment without sending money before batching', async () => {
    paymentOrders.create.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.READY,
      executionMode: PaymentExecutionMode.BATCH,
    })

    await service.create('tenant-1', 'merchant-1', 'order-1')

    expect(execution.submit).not.toHaveBeenCalled()
    expect(paymentOrders.detail).toHaveBeenCalledWith('tenant-1', 'payment-1')
  })

  it.each([
    ['not payable', { payable: false }],
    ['identity mismatch', { identityMatched: false }],
    ['wrong status', { status: MerchantOrderStatus.CANCELLED }],
    ['missing payee identity', { payeeIdentity: null }],
  ])('rejects %s before creating a payment', async (_name, change) => {
    merchantOrders.detail.mockResolvedValue({ ...order, ...change })

    await expect(service.create('tenant-1', 'merchant-1', 'order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(paymentOrders.create).not.toHaveBeenCalled()
  })

  it('rejects creating another payment when the merchant order already has a failed payment', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: { id: 'payment-1', status: PaymentOrderStatus.FAILED },
    })

    await expect(service.create('tenant-1', 'merchant-1', 'order-1')).rejects.toThrow(
      new ConflictException('商家订单已存在支付订单，请在支付订单中处理'),
    )
    expect(paymentOrders.create).not.toHaveBeenCalled()
    expect(execution.submit).not.toHaveBeenCalled()
  })

  it('allows an explicitly reviewed identity mismatch and records the Telegram operator', async () => {
    merchantOrders.detail.mockResolvedValue({ ...order, identityMatched: false })

    await service.createAfterManualReview('tenant-1', 'merchant-1', 'order-1', 'TG:88')

    expect(paymentOrders.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ sourceBusinessNo: 'platform-order-1' }),
      {
        automaticOnly: false,
        reason: '实名不一致订单已由 TG:88 人工确认',
        requireRoute: true,
        source: 'TELEGRAM_C2C_REVIEW',
      },
    )
  })

  it('retries only platform confirmation without submitting payment again', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: {
        id: 'payment-1',
        status: PaymentOrderStatus.SUCCESS,
        platformConfirmStatus: PlatformConfirmationStatus.FAILED,
      },
    })
    execution.confirmPlatform.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.SUCCESS,
    })

    await service.confirmPaid('tenant-1', 'merchant-1', 'order-1')

    expect(execution.confirmPlatform).toHaveBeenCalledWith(
      {
        id: 'payment-1',
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        sourceBusinessNo: 'platform-order-1',
        status: PaymentOrderStatus.SUCCESS,
        upstreamId: undefined,
        platformConfirmStatus: PlatformConfirmationStatus.FAILED,
      },
      { manualRetry: true },
    )
    expect(execution.submit).not.toHaveBeenCalled()
  })

  it('rejects platform confirmation before the payment succeeds', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: { id: 'payment-1', status: PaymentOrderStatus.READY },
    })

    await expect(service.confirmPaid('tenant-1', 'merchant-1', 'order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(execution.confirmPlatform).not.toHaveBeenCalled()
  })

  it('rejects a manual retry while another worker owns platform confirmation', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: {
        id: 'payment-1',
        status: PaymentOrderStatus.SUCCESS,
        platformConfirmStatus: PlatformConfirmationStatus.PROCESSING,
      },
    })

    await expect(service.confirmPaid('tenant-1', 'merchant-1', 'order-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(execution.confirmPlatform).not.toHaveBeenCalled()
  })

  it('returns a payment whose platform confirmation already succeeded', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: {
        id: 'payment-1',
        status: PaymentOrderStatus.SUCCESS,
        platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
      },
    })

    await expect(service.confirmPaid('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      id: 'payment-1',
      status: PaymentOrderStatus.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
    })
    expect(execution.confirmPlatform).not.toHaveBeenCalled()
  })

  it('cancels a merchant order and its unsubmitted payment atomically', async () => {
    merchantOrders.detail
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({ ...order, status: MerchantOrderStatus.CANCELLED })

    await expect(
      service.cancel('tenant-1', 'merchant-1', 'order-1', 'admin', '收款资料有误'),
    ).resolves.toMatchObject({ status: MerchantOrderStatus.CANCELLED })

    expect(cancellation.cancel).toHaveBeenCalledWith('tenant-1', {
      merchantId: 'merchant-1',
      merchantOrderId: 'order-1',
      operator: 'admin',
      reason: '收款资料有误',
      sourceBusinessNo: 'platform-order-1',
    })
    expect(execution.submit).not.toHaveBeenCalled()
  })
})
