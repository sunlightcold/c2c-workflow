import {
  BusinessStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import {
  BinanceC2cClient,
  type BinanceCredentials,
  C2cBuyOrderStatus,
  type C2cBuyOrderDetail,
  C2cPlatformCredentialFactory,
  OkxWebPrivateClient,
  type OkxWebPrivateCredentials,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from '../c2c-order/c2c-secret-resolver'
import {
  PAYMENT_PREFLIGHT_STORE,
  type PaymentPreflightConfiguration,
  type PaymentPreflightStore,
} from './c2c-payment-preflight-verifier'
import { PlatformFundsExceptionError } from './payment-execution.errors'
import { normalizeCnyAmount } from './payment-adapter.types'
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
    private readonly binance: BinanceC2cClient,
    private readonly okx: OkxWebPrivateClient,
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
    const current = await this.getOrder(context, credentials)
    this.verifyPlatformOrder(context, current)
    if (await this.finalizeKnownStatus(context, current.status)) return
    if (current.status !== C2cBuyOrderStatus.PENDING_PAYMENT || !current.payable) {
      throw new Error(`平台订单状态 ${current.status} 不允许确认已付款`)
    }
    await this.markPaid(context, credentials)
    const confirmed = await this.getOrder(context, credentials)
    this.verifyPlatformOrder(context, confirmed)
    if (await this.finalizeKnownStatus(context, confirmed.status)) return
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
    if (
      context.merchant.status !== BusinessStatus.ACTIVE ||
      context.credential.status !== BusinessStatus.ACTIVE
    ) {
      throw new Error('商家或平台凭据不可用')
    }
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
    credentials: BinanceCredentials | OkxWebPrivateCredentials,
  ): Promise<void> {
    const orderId = context.merchantOrder.platformOrderId
    const paymentMethodId = context.merchantOrder.platformPaymentMethodId!
    if (context.merchant.platform === MerchantPlatform.BINANCE) {
      const payId = Number(paymentMethodId)
      if (!Number.isSafeInteger(payId) || payId <= 0) throw new Error('币安平台付款方式 ID 无效')
      await this.binance.markOrderAsPaid(credentials as BinanceCredentials, orderId, payId)
      return
    }
    const risk = await this.okx.checkAntiFraud(
      credentials as OkxWebPrivateCredentials,
      orderId,
      context.merchantOrder.fiatCurrency,
    )
    if (risk.riskReviewRequired) throw new Error('欧易反欺诈检查要求人工复核')
    await this.okx.markOrderAsPaid(
      credentials as OkxWebPrivateCredentials,
      orderId,
      paymentMethodId,
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
    if (current.fiatCurrency !== context.order.currency) throw new Error('平台订单币种已变化')
    if (current.paymentMethod !== context.order.paymentMethod)
      throw new Error('平台订单收款方式已变化')
    if (
      current.payeeIdentity !== context.order.payeeIdentity ||
      current.payeeName !== context.order.payeeName
    ) {
      throw new Error('平台订单收款资料已变化')
    }
    if (current.platformPaymentMethodId !== snapshot.platformPaymentMethodId)
      throw new Error('平台付款方式已变化')
  }

  private getOrder(
    context: PaymentPreflightConfiguration,
    credentials: BinanceCredentials | OkxWebPrivateCredentials,
  ) {
    return context.merchant.platform === MerchantPlatform.BINANCE
      ? this.binance.getOrderDetail(
          credentials as BinanceCredentials,
          context.merchantOrder.platformOrderId,
        )
      : this.okx.getOrderDetail(
          credentials as OkxWebPrivateCredentials,
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
}
