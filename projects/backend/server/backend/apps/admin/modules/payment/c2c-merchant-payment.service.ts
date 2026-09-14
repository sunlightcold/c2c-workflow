import {
  MerchantOrderStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { C2cOrderService } from '../c2c-order/c2c-order.service'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import { PaymentOrderService } from './payment-order.service'
import { C2cPaymentCancellationService } from './c2c-payment-cancellation.service'

@Injectable()
export class C2cMerchantPaymentService {
  constructor(
    private readonly merchantOrders: C2cOrderService,
    private readonly paymentOrders: PaymentOrderService,
    private readonly execution: PaymentExecutionCoordinator,
    private readonly cancellation: C2cPaymentCancellationService,
  ) {}

  async create(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    executionMode: PaymentExecutionMode,
  ) {
    const merchantOrder = await this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
    this.assertPayable(merchantOrder)
    const paymentOrder = await this.paymentOrders.create(tenantId, {
      merchantId,
      sourceType: PaymentSourceType.C2C_BUY,
      sourceBusinessNo: merchantOrder.platformOrderId,
      amount: merchantOrder.fiatAmount,
      currency: merchantOrder.fiatCurrency,
      paymentMethod: merchantOrder.paymentMethod!,
      executionMode,
      payeeIdentity: merchantOrder.payeeIdentity!,
      payeeName: merchantOrder.payeeName!,
    })
    if (
      executionMode === PaymentExecutionMode.INSTANT &&
      paymentOrder.status === PaymentOrderStatus.READY
    ) {
      await this.execution.submit(tenantId, paymentOrder.id)
    }
    return this.paymentOrders.detail(tenantId, paymentOrder.id)
  }

  async confirmPaid(tenantId: string, merchantId: string, merchantOrderId: string) {
    const merchantOrder = await this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
    const paymentOrder = merchantOrder.paymentOrder
    if (!paymentOrder) throw new BadRequestException('商家订单没有关联支付订单')
    if (paymentOrder.status === PaymentOrderStatus.COMPLETED) return paymentOrder
    if (paymentOrder.status !== PaymentOrderStatus.PLATFORM_CONFIRM_PENDING) {
      throw new BadRequestException('支付订单当前不需要补偿确认')
    }
    return this.execution.confirmPlatform({
      id: paymentOrder.id,
      tenantId,
      status: paymentOrder.status,
      upstreamId: paymentOrder.upstreamId ?? undefined,
    })
  }

  async cancel(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    operator: string,
    reason: string,
  ) {
    const merchantOrder = await this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
    await this.cancellation.cancel(tenantId, {
      merchantId,
      merchantOrderId,
      operator,
      reason,
      sourceBusinessNo: merchantOrder.platformOrderId,
    })
    return this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
  }

  private assertPayable(order: {
    status: MerchantOrderStatus
    payable: boolean
    identityMatched: boolean
    paymentMethod: string | null
    paymentOrder?: { status: PaymentOrderStatus } | null
    payeeIdentity: string | null
    payeeName: string | null
  }): void {
    if (order.status !== MerchantOrderStatus.PENDING_PAYMENT || !order.payable) {
      throw new BadRequestException('商家订单当前不可支付')
    }
    if (order.paymentOrder) {
      throw new ConflictException('商家订单已存在支付订单，请在支付订单中处理')
    }
    if (!order.identityMatched) throw new BadRequestException('收款人与平台实名不一致')
    if (order.paymentMethod !== 'ALIPAY' || !order.payeeIdentity || !order.payeeName) {
      throw new BadRequestException('商家订单缺少完整的支付宝收款资料')
    }
  }
}
