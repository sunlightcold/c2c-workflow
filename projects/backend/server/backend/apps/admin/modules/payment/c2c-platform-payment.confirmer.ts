import {
  BusinessStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  C2cPlatformClient,
  type C2cPlatformCredentials,
  C2cBuyOrderStatus,
  type C2cBuyOrderDetail,
  C2cPlatformCredentialFactory,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from '../c2c-order/c2c-secret-resolver'
import {
  PAYMENT_PREFLIGHT_STORE,
  type PaymentPreflightConfiguration,
  type PaymentPreflightStore,
} from './c2c-payment-preflight-verifier'
import { PlatformFundsExceptionError } from './payment-execution.errors'
import { C2cPaymentProofService } from './c2c-payment-proof.service'
import { C2cPlatformChatService } from '../c2c-order/c2c-platform-chat.service'
import { C2cPaidConfirmationThrottleService } from './c2c-paid-confirmation-throttle.service'
import type {
  ExecutablePaymentOrder,
  PlatformPaymentConfirmer,
} from './payment-execution-coordinator'

export interface PlatformConfirmationStore extends PaymentPreflightStore {
  transitionMerchantOrder: (
    tenantId: string,
    merchantOrderId: string,
    status: MerchantOrderStatus,
    platformStatus: C2cBuyOrderStatus,
  ) => Promise<void>
}

@Injectable()
export class C2cPlatformPaymentConfirmer implements PlatformPaymentConfirmer {
  private readonly logger = new Logger(C2cPlatformPaymentConfirmer.name)

  constructor(
    @Inject(PAYMENT_PREFLIGHT_STORE) private readonly store: PlatformConfirmationStore,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
    private readonly paymentProofs: C2cPaymentProofService,
    private readonly throttle: C2cPaidConfirmationThrottleService,
    @Optional() private readonly platformChat?: C2cPlatformChatService,
  ) {}

  async confirmPaid(
    order: ExecutablePaymentOrder,
    options: { queryOnly?: boolean } = {},
  ): Promise<void> {
    const loadedContext = await this.store.load(order.tenantId, order.id)
    const context: PaymentPreflightConfiguration = {
      ...loadedContext,
      merchantOrder: { ...loadedContext.merchantOrder },
    }
    this.verifyContext(context)
    this.logger.log(
      `C2C 标记付款上下文加载完成: ${this.confirmationLogContext(context, order, options.queryOnly ? 'QUERY_ONLY' : 'MARK_PAID')}`,
    )
    if (
      [MerchantOrderStatus.PENDING_RELEASE, MerchantOrderStatus.COMPLETED].includes(
        context.merchantOrder.status,
      )
    ) {
      this.logger.log(
        `C2C 标记付款跳过已完成订单: ${this.confirmationLogContext(context, order, 'SKIP_COMPLETED')}`,
      )
      return
    }
    if (this.isFundsConflict(context.merchantOrder.status)) {
      await this.toFundsException(context, this.toPlatformStatus(context.merchantOrder.status))
    }
    const previousMerchantOrderStatus = context.merchantOrder.status
    await this.store.transitionMerchantOrder(
      context.order.tenantId,
      context.merchantOrder.id,
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      C2cBuyOrderStatus.PENDING_PAYMENT,
    )
    context.merchantOrder.status = MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM
    this.logger.log(
      `C2C 商家订单进入待平台确认: ${this.confirmationLogContext(context, order, options.queryOnly ? 'QUERY_ONLY' : 'MARK_PAID')}, fromMerchantOrderStatus=${previousMerchantOrderStatus}, toMerchantOrderStatus=${MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM}`,
    )
    const secret = await this.secretResolver.resolve(context.credential.credentialRef)
    const credentials = this.credentialFactory.create(
      context.merchant.platform,
      context.credential,
      secret,
    )
    this.logger.log(
      `C2C 标记付款上游查单: ${this.confirmationLogContext(context, order, options.queryOnly ? 'QUERY_ONLY' : 'PRE_MARK_QUERY')}`,
    )
    const current = await this.getOrder(context, credentials)
    this.logger.log(
      `C2C 标记付款上游查单响应: ${this.confirmationLogContext(context, order, options.queryOnly ? 'QUERY_ONLY' : 'PRE_MARK_QUERY')}, upstreamOrderStatus=${current.status}, payable=${current.payable}`,
    )
    this.verifyPlatformOrder(context, current)
    if (await this.finalizeKnownStatus(context, current.status)) {
      await this.notifyPaid(context, current.status)
      return
    }
    if (current.status !== C2cBuyOrderStatus.PENDING_PAYMENT || !current.payable) {
      throw new Error(`平台订单状态 ${current.status} 不允许确认已付款`)
    }
    if (options.queryOnly) throw new Error('平台订单仍待付款，请人工重试标记付款')
    if (!current.platformPaymentMethodId) throw new Error('平台订单缺少付款方式 ID')
    this.logger.log(
      `C2C 标记付款提交上游: ${this.confirmationLogContext(context, order, 'MARK_PAID')}`,
    )
    await this.throttle.execute(
      context.merchant,
      () => this.markPaid(context, credentials, current.platformPaymentMethodId),
      {
        merchantOrderId: context.merchantOrder.id,
        platformOrderId: context.merchantOrder.platformOrderId,
        paymentOrderId: context.order.id,
        paymentNo: context.order.paymentNo,
        paymentUpstreamId: order.upstreamId,
        batchId: order.batchId,
        batchNo: order.batchNo,
        batchUpstreamId: order.batchUpstreamId,
      },
    )
    this.logger.log(
      `C2C 标记付款上游请求完成: ${this.confirmationLogContext(context, order, 'MARK_PAID')}`,
    )
    if (context.merchant.platform === MerchantPlatform.BINANCE) {
      await this.store.transitionMerchantOrder(
        context.order.tenantId,
        context.merchantOrder.id,
        MerchantOrderStatus.PENDING_RELEASE,
        C2cBuyOrderStatus.PAID,
      )
      context.merchantOrder.status = MerchantOrderStatus.PENDING_RELEASE
      await this.notifyPaid(context, C2cBuyOrderStatus.PAID)
      this.logger.log(
        `C2C 标记付款平台确认成功: ${this.confirmationLogContext(context, order, 'MARK_PAID')}, upstreamOrderStatus=${C2cBuyOrderStatus.PAID}, toMerchantOrderStatus=${MerchantOrderStatus.PENDING_RELEASE}`,
      )
      return
    }
    this.logger.log(
      `C2C 标记付款结果查单: ${this.confirmationLogContext(context, order, 'POST_MARK_QUERY')}`,
    )
    const confirmed = await this.getOrder(context, credentials)
    this.logger.log(
      `C2C 标记付款结果查单响应: ${this.confirmationLogContext(context, order, 'POST_MARK_QUERY')}, upstreamOrderStatus=${confirmed.status}, payable=${confirmed.payable}`,
    )
    this.verifyPlatformOrder(context, confirmed)
    if (await this.finalizeKnownStatus(context, confirmed.status)) {
      await this.notifyPaid(context, confirmed.status)
      this.logger.log(
        `C2C 标记付款平台确认成功: ${this.confirmationLogContext(context, order, 'POST_MARK_QUERY')}, upstreamOrderStatus=${confirmed.status}`,
      )
      return
    }
    throw new Error('平台尚未确认已付款')
  }

  private verifyContext(context: PaymentPreflightConfiguration): void {
    if (context.order.sourceType !== PaymentSourceType.C2C_BUY)
      throw new Error('支付订单不是 C2C 买币来源')
    if (context.order.status !== PaymentOrderStatus.SUCCESS) {
      throw new Error('支付订单未处于平台确认阶段')
    }
    if (context.credential.status !== BusinessStatus.ACTIVE) throw new Error('商家平台凭据不可用')
    if (
      context.merchant.platform !== context.merchantOrder.platform ||
      context.merchant.platform !== context.credential.platform
    ) {
      throw new Error('商家平台配置不一致')
    }
    if (!context.merchantOrder.platformPaymentMethodId) throw new Error('商家订单缺少平台付款方式')
  }

  private async markPaid(
    context: PaymentPreflightConfiguration,
    credentials: C2cPlatformCredentials,
    paymentMethodId: string,
  ): Promise<void> {
    const orderId = context.merchantOrder.platformOrderId
    const policy = this.platformClient.getMarkPaidPolicy(context.merchant.platform, credentials)
    const paymentProofImages =
      policy.paymentProof !== 'REQUIRED'
        ? undefined
        : await this.paymentProofs.load({
            tenantId: context.order.tenantId,
            merchantId: context.order.merchantId,
            paymentOrderId: context.order.id,
            platformOrderId: orderId,
          })
    await this.platformClient.markOrderAsPaid(
      context.merchant.platform,
      credentials,
      orderId,
      paymentMethodId,
      policy.paymentProof === 'NONE'
        ? undefined
        : {
            fiat: context.merchantOrder.fiatCurrency,
            skipPaymentProofUpload: policy.paymentProof === 'SKIP',
            ...(paymentProofImages ? { paymentProofImages } : {}),
          },
    )
  }

  private verifyPlatformOrder(
    context: PaymentPreflightConfiguration,
    current: C2cBuyOrderDetail,
  ): void {
    const snapshot = context.merchantOrder
    if (current.platformOrderId !== snapshot.platformOrderId) throw new Error('平台订单编号不匹配')
  }

  private getOrder(context: PaymentPreflightConfiguration, credentials: C2cPlatformCredentials) {
    return this.platformClient.getOrderDetail(
      context.merchant.platform,
      credentials,
      context.merchantOrder.platformOrderId,
    )
  }

  private async finalizeKnownStatus(
    context: PaymentPreflightConfiguration,
    status: C2cBuyOrderStatus,
  ): Promise<boolean> {
    if (status === C2cBuyOrderStatus.PAID || status === C2cBuyOrderStatus.COMPLETED) {
      const merchantOrderStatus =
        status === C2cBuyOrderStatus.COMPLETED
          ? MerchantOrderStatus.COMPLETED
          : MerchantOrderStatus.PENDING_RELEASE
      await this.store.transitionMerchantOrder(
        context.order.tenantId,
        context.merchantOrder.id,
        merchantOrderStatus,
        status,
      )
      context.merchantOrder.status = merchantOrderStatus
      return true
    }
    if (this.isPlatformFundsConflict(status)) await this.toFundsException(context, status)
    return false
  }

  private async toFundsException(
    context: PaymentPreflightConfiguration,
    status: C2cBuyOrderStatus,
  ): Promise<never> {
    await this.store.transitionMerchantOrder(
      context.order.tenantId,
      context.merchantOrder.id,
      MerchantOrderStatus.FUNDS_EXCEPTION,
      status,
    )
    throw new PlatformFundsExceptionError(`资金已支付，但平台订单状态为 ${status}`)
  }

  private isPlatformFundsConflict(status: C2cBuyOrderStatus): boolean {
    return [
      C2cBuyOrderStatus.CANCELLED,
      C2cBuyOrderStatus.EXPIRED,
      C2cBuyOrderStatus.DISPUTED,
    ].includes(status)
  }

  private isFundsConflict(status: MerchantOrderStatus): boolean {
    return [
      MerchantOrderStatus.CANCELLED,
      MerchantOrderStatus.EXPIRED,
      MerchantOrderStatus.DISPUTED,
      MerchantOrderStatus.FUNDS_EXCEPTION,
    ].includes(status)
  }

  private toPlatformStatus(status: MerchantOrderStatus): C2cBuyOrderStatus {
    const values: Partial<Record<MerchantOrderStatus, C2cBuyOrderStatus>> = {
      [MerchantOrderStatus.CANCELLED]: C2cBuyOrderStatus.CANCELLED,
      [MerchantOrderStatus.EXPIRED]: C2cBuyOrderStatus.EXPIRED,
      [MerchantOrderStatus.DISPUTED]: C2cBuyOrderStatus.DISPUTED,
    }
    return values[status] ?? C2cBuyOrderStatus.UNKNOWN
  }

  private confirmationLogContext(
    context: PaymentPreflightConfiguration,
    order: ExecutablePaymentOrder,
    operation: string,
  ): string {
    return [
      `tenantId=${context.order.tenantId}`,
      `merchantId=${context.merchant.id}`,
      `merchantCode=${context.merchant.code ?? 'unknown'}`,
      `merchantOrderId=${context.merchantOrder.id}`,
      `platform=${context.merchant.platform}`,
      `platformOrderId=${context.merchantOrder.platformOrderId}`,
      `paymentOrderId=${context.order.id}`,
      `paymentNo=${context.order.paymentNo}`,
      `paymentUpstreamId=${order.upstreamId ?? 'none'}`,
      `batchId=${order.batchId ?? 'none'}`,
      `batchNo=${order.batchNo ?? 'none'}`,
      `batchUpstreamId=${order.batchUpstreamId ?? 'none'}`,
      `operation=${operation}`,
      `paymentStatus=${context.order.status}`,
      `merchantOrderStatus=${context.merchantOrder.status}`,
    ].join(', ')
  }

  private async notifyPaid(
    context: PaymentPreflightConfiguration,
    status: C2cBuyOrderStatus,
  ): Promise<void> {
    await this.platformChat?.sendOrderPaid(
      context.order.tenantId,
      context.order.merchantId,
      context.merchantOrder.id,
    )
    if (status === C2cBuyOrderStatus.COMPLETED) {
      await this.platformChat?.sendOrderCompleted(
        context.order.tenantId,
        context.order.merchantId,
        context.merchantOrder.id,
      )
    }
  }
}
