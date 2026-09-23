import {
  MerchantOrderStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
  PlatformConfirmationStatus,
} from '@admin/database'
import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common'
import { C2cOrderService } from '../c2c-order/c2c-order.service'
import { C2cPlatformChatService } from '../c2c-order/c2c-platform-chat.service'
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
    @Optional() private readonly platformChat?: C2cPlatformChatService,
  ) {}

  async create(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    automaticOnly = false,
  ) {
    return this.createFromOrder(tenantId, merchantId, merchantOrderId, automaticOnly)
  }

  /**
   * Kept for stale Telegram callbacks. New orders no longer require a review;
   * this path now uses the same creation flow as the normal payment action.
   */
  async createAfterManualReview(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    _operator: string,
  ) {
    return this.create(tenantId, merchantId, merchantOrderId)
  }

  async confirmPaid(tenantId: string, merchantId: string, merchantOrderId: string) {
    const merchantOrder = await this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
    const paymentOrder = merchantOrder.paymentOrder
    if (!paymentOrder) throw new BadRequestException('商家订单没有关联支付订单')
    if (paymentOrder.status !== PaymentOrderStatus.SUCCESS) {
      throw new BadRequestException('支付订单当前不需要补偿确认')
    }
    if (paymentOrder.platformConfirmStatus === PlatformConfirmationStatus.SUCCESS)
      return paymentOrder
    if (paymentOrder.platformConfirmStatus !== PlatformConfirmationStatus.FAILED) {
      throw new ConflictException('平台确认正在处理或尚未进入人工补偿状态')
    }
    return this.execution.confirmPlatform(
      {
        id: paymentOrder.id,
        tenantId,
        merchantId,
        sourceBusinessNo: merchantOrder.platformOrderId,
        status: paymentOrder.status,
        upstreamId: paymentOrder.upstreamId ?? undefined,
        platformConfirmStatus: paymentOrder.platformConfirmStatus,
      },
      { manualRetry: true },
    )
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

  private async createFromOrder(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    automaticOnly: boolean,
  ) {
    const merchantOrder = await this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
    this.assertPayable(merchantOrder)
    const paymentInput = {
      merchantId,
      sourceType: PaymentSourceType.C2C_BUY,
      sourceBusinessNo: merchantOrder.platformOrderId,
      amount: merchantOrder.fiatAmount,
      currency: merchantOrder.fiatCurrency,
      paymentMethod: merchantOrder.paymentMethod!,
      payeeIdentity: merchantOrder.payeeIdentity!,
      payeeName: merchantOrder.identityName!,
    }
    const paymentOrder = await this.paymentOrders.create(tenantId, paymentInput, {
      automaticOnly,
      requireRoute: true,
    })
    await this.platformChat?.sendOrderCreated(tenantId, merchantId, merchantOrderId)
    if (
      paymentOrder.executionMode === PaymentExecutionMode.INSTANT &&
      paymentOrder.status === PaymentOrderStatus.READY
    ) {
      await this.execution.submit(tenantId, paymentOrder.id)
    }
    return this.paymentOrders.detail(tenantId, paymentOrder.id)
  }

  private assertPayable(order: {
    status: MerchantOrderStatus
    payable: boolean
    paymentMethod: string | null
    identityName: string | null
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
    if (
      order.paymentMethod !== 'ALIPAY' ||
      !order.payeeIdentity ||
      !order.payeeName ||
      !order.identityName
    ) {
      throw new BadRequestException('商家订单缺少完整的支付宝收款资料')
    }
  }
}
