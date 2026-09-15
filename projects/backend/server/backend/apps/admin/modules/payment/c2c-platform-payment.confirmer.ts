import {
  BusinessStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { Inject, Injectable, Optional } from '@nestjs/common'
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
import { normalizeCnyAmount } from './payment-adapter.types'
import { C2cPaymentProofService } from './c2c-payment-proof.service'
import { C2cPlatformChatService } from '../c2c-order/c2c-platform-chat.service'
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
  constructor(
    @Inject(PAYMENT_PREFLIGHT_STORE) private readonly store: PlatformConfirmationStore,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
    private readonly paymentProofs: C2cPaymentProofService,
    @Optional() private readonly platformChat?: C2cPlatformChatService,
  ) {}

  async confirmPaid(order: ExecutablePaymentOrder): Promise<void> {
    const context = await this.store.load(order.tenantId, order.id)
    this.verifyContext(context)
    if (
      [MerchantOrderStatus.PENDING_RELEASE, MerchantOrderStatus.COMPLETED].includes(
        context.merchantOrder.status,
      )
    ) {
      return
    }
    if (this.isFundsConflict(context.merchantOrder.status)) {
      await this.toFundsException(context, this.toPlatformStatus(context.merchantOrder.status))
    }
    const recovering =
      context.merchantOrder.status === MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM
    await this.store.transitionMerchantOrder(
      context.order.tenantId,
      context.merchantOrder.id,
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      C2cBuyOrderStatus.PENDING_PAYMENT,
    )
    const secret = await this.secretResolver.resolve(context.credential.credentialRef)
    const credentials = this.credentialFactory.create(
      context.merchant.platform,
      context.credential,
      secret,
    )
    let paymentMethodId = context.merchantOrder.platformPaymentMethodId!
    if (recovering) {
      const current = await this.getOrder(context, credentials)
      this.verifyPlatformOrder(context, current)
      if (await this.finalizeKnownStatus(context, current.status)) {
        await this.notifyPaid(context, current.status)
        return
      }
      if (current.status !== C2cBuyOrderStatus.PENDING_PAYMENT || !current.payable) {
        throw new Error(`平台订单状态 ${current.status} 不允许确认已付款`)
      }
      paymentMethodId = current.platformPaymentMethodId
    }
    await this.markPaid(context, credentials, paymentMethodId)
    if (context.merchant.platform === MerchantPlatform.BINANCE) {
      await this.store.transitionMerchantOrder(
        context.order.tenantId,
        context.merchantOrder.id,
        MerchantOrderStatus.PENDING_RELEASE,
        C2cBuyOrderStatus.PAID,
      )
      await this.notifyPaid(context, C2cBuyOrderStatus.PAID)
      return
    }
    const confirmed = await this.getOrder(context, credentials)
    this.verifyPlatformOrder(context, confirmed)
    if (await this.finalizeKnownStatus(context, confirmed.status)) {
      await this.notifyPaid(context, confirmed.status)
      return
    }
    throw new Error('平台尚未确认已付款')
  }

  private verifyContext(context: PaymentPreflightConfiguration): void {
    if (context.order.sourceType !== PaymentSourceType.C2C_BUY)
      throw new Error('支付订单不是 C2C 买币来源')
    if (
      ![PaymentOrderStatus.SUCCESS, PaymentOrderStatus.PLATFORM_CONFIRM_PENDING].includes(
        context.order.status,
      )
    ) {
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
    if (!this.sameAmount(current.fiatAmount, context.order.amount))
      throw new Error('平台订单金额已变化')
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
      await this.store.transitionMerchantOrder(
        context.order.tenantId,
        context.merchantOrder.id,
        status === C2cBuyOrderStatus.COMPLETED
          ? MerchantOrderStatus.COMPLETED
          : MerchantOrderStatus.PENDING_RELEASE,
        status,
      )
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

  private sameAmount(left: string, right: string): boolean {
    try {
      return normalizeCnyAmount(left) === normalizeCnyAmount(right)
    } catch {
      return false
    }
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
