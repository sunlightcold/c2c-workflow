import {
  MerchantOrderStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { BadRequestException } from '@nestjs/common'
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
  }
  const merchantOrders = { detail: jest.fn() }
  const paymentOrders = { create: jest.fn(), detail: jest.fn() }
  const cancellation = { cancel: jest.fn() }
  const execution = { confirmPlatform: jest.fn(), submit: jest.fn() }
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
    service = new C2cMerchantPaymentService(
      merchantOrders as unknown as C2cOrderService,
      paymentOrders as unknown as PaymentOrderService,
      execution as unknown as PaymentExecutionCoordinator,
      cancellation as unknown as C2cPaymentCancellationService,
    )
  })

  it('creates an instant payment from trusted merchant-order fields and submits it', async () => {
    await expect(
      service.create('tenant-1', 'merchant-1', 'order-1', PaymentExecutionMode.INSTANT),
    ).resolves.toEqual({ id: 'payment-1', status: PaymentOrderStatus.COMPLETED })

    expect(paymentOrders.create).toHaveBeenCalledWith('tenant-1', {
      merchantId: 'merchant-1',
      sourceType: PaymentSourceType.C2C_BUY,
      sourceBusinessNo: 'platform-order-1',
      amount: '100.00',
      currency: 'CNY',
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.INSTANT,
      payeeIdentity: 'payee@example.com',
      payeeName: 'Payee',
    })
    expect(execution.submit).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(paymentOrders.detail).toHaveBeenCalledWith('tenant-1', 'payment-1')
  })

  it('creates a batch payment without sending money before batching', async () => {
    paymentOrders.create.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.READY,
      executionMode: PaymentExecutionMode.BATCH,
    })

    await service.create('tenant-1', 'merchant-1', 'order-1', PaymentExecutionMode.BATCH)

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

    await expect(
      service.create('tenant-1', 'merchant-1', 'order-1', PaymentExecutionMode.INSTANT),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(paymentOrders.create).not.toHaveBeenCalled()
  })

  it('retries only platform confirmation without submitting payment again', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: { id: 'payment-1', status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING },
    })
    execution.confirmPlatform.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.COMPLETED,
    })

    await service.confirmPaid('tenant-1', 'merchant-1', 'order-1')

    expect(execution.confirmPlatform).toHaveBeenCalledWith({
      id: 'payment-1',
      tenantId: 'tenant-1',
      status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
      upstreamId: undefined,
    })
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

  it('returns an already completed payment without confirming it again', async () => {
    merchantOrders.detail.mockResolvedValue({
      ...order,
      paymentOrder: { id: 'payment-1', status: PaymentOrderStatus.COMPLETED },
    })

    await expect(service.confirmPaid('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      id: 'payment-1',
      status: PaymentOrderStatus.COMPLETED,
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
