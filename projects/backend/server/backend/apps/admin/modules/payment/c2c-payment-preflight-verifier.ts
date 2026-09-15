import {
  BusinessStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentAdapterCode,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import {
  C2cPlatformClient,
  type C2cPlatformCredentials,
  C2cPlatformCredentialFactory,
  C2cBuyOrderStatus,
  type C2cBuyOrderDetail,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from '../c2c-order/c2c-secret-resolver'
import { normalizeCnyAmount } from './payment-adapter.types'
import { PaymentNotSubmittedError } from './payment-execution-coordinator'

export interface PaymentPreflightConfiguration {
  order: {
    id: string
    tenantId: string
    merchantId: string
    sourceType: PaymentSourceType
    sourceBusinessNo: string
    paymentNo: string
    amount: string
    currency: string
    paymentMethod: string
    executionMode: PaymentExecutionMode
    payeeIdentity: string
    payeeName: string
    paymentPlanId: string | null
    paymentAccountId: string | null
    paymentAccountChannelId: string | null
    status: PaymentOrderStatus
  }
  merchant: {
    id: string
    tenantId: string
    platform: MerchantPlatform
    status: BusinessStatus
  }
  merchantOrder: {
    id: string
    tenantId: string
    merchantId: string
    platform: MerchantPlatform
    platformOrderId: string
    status: MerchantOrderStatus
    payable: boolean
    fiatAmount: string
    fiatCurrency: string
    paymentMethod: string | null
    platformPaymentMethodId: string | null
    payeeIdentity: string | null
    payeeName: string | null
    paymentDeadline: Date | null
  }
  credential: {
    platform: MerchantPlatform
    credentialRef: string
    clientType: string | null
    xUserId: string | null
    requestTimeoutMs: number
    status: BusinessStatus
  }
  plan: {
    id: string
    tenantId: string
    merchantId: string
    paymentAccountId: string
    paymentAccountChannelId: string
    status: BusinessStatus
  }
  account: {
    id: string
    tenantId: string
    platformId: string
    credentialRef: string
    status: BusinessStatus
  }
  accountChannel: {
    id: string
    paymentAccountId: string
    channelId: string
    status: BusinessStatus
  }
  channel: {
    id: string
    platformId: string
    adapterCode: PaymentAdapterCode
    executionMode: PaymentExecutionMode
    status: BusinessStatus
  }
  paymentPlatform: {
    id: string
    code: string
    status: BusinessStatus
  }
}

export interface PaymentPreflightStore {
  load: (tenantId: string, orderId: string) => Promise<PaymentPreflightConfiguration>
}

export interface VerifiedC2cPayment {
  order: PaymentPreflightConfiguration['order']
  platformOrder: C2cBuyOrderDetail
  paymentAccountCredentialRef: string
}

export const PAYMENT_PREFLIGHT_STORE = Symbol('PAYMENT_PREFLIGHT_STORE')

@Injectable()
export class C2cPaymentPreflightVerifier {
  constructor(
    @Inject(PAYMENT_PREFLIGHT_STORE) private readonly store: PaymentPreflightStore,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
  ) {}

  async verify(tenantId: string, orderId: string, now = new Date()): Promise<VerifiedC2cPayment> {
    return this.verifyFor(tenantId, orderId, now, {
      orderStatus: PaymentOrderStatus.SUBMITTING,
      merchantOrderStatus: MerchantOrderStatus.PAYMENT_PROCESSING,
      adapterCode: PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER,
      executionMode: PaymentExecutionMode.INSTANT,
      channelError: '支付通道不支持即时商家转账',
    })
  }

  async verifyBatch(
    tenantId: string,
    orderId: string,
    now = new Date(),
  ): Promise<VerifiedC2cPayment> {
    return this.verifyFor(tenantId, orderId, now, {
      orderStatus: PaymentOrderStatus.READY,
      merchantOrderStatus: MerchantOrderStatus.PENDING_PAYMENT,
      adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
      executionMode: PaymentExecutionMode.BATCH,
      channelError: '支付通道不支持支付宝批量有密',
    })
  }

  loadContext(tenantId: string, orderId: string): Promise<PaymentPreflightConfiguration> {
    return this.store.load(tenantId, orderId)
  }

  private async verifyFor(
    tenantId: string,
    orderId: string,
    now: Date,
    expected: {
      orderStatus: PaymentOrderStatus
      merchantOrderStatus: MerchantOrderStatus
      adapterCode: PaymentAdapterCode
      executionMode: PaymentExecutionMode
      channelError: string
    },
  ): Promise<VerifiedC2cPayment> {
    const context = await this.store.load(tenantId, orderId)
    this.verifyLocal(context, now, expected)
    let platformOrder: C2cBuyOrderDetail
    try {
      const secret = await this.secretResolver.resolve(context.credential.credentialRef)
      const credentials = this.credentialFactory.create(
        context.merchant.platform,
        context.credential,
        secret,
      )
      platformOrder = await this.getPlatformOrder(context, credentials)
    } catch (error) {
      throw this.notSubmitted(error)
    }
    this.verifyPlatform(context, platformOrder, now)
    return {
      order: context.order,
      platformOrder,
      paymentAccountCredentialRef: context.account.credentialRef,
    }
  }

  private verifyLocal(
    context: PaymentPreflightConfiguration,
    now: Date,
    expected: {
      orderStatus: PaymentOrderStatus
      merchantOrderStatus: MerchantOrderStatus
      adapterCode: PaymentAdapterCode
      executionMode: PaymentExecutionMode
      channelError: string
    },
  ): void {
    const { order, merchant, merchantOrder, credential, plan, account, accountChannel, channel } =
      context
    this.require(order.sourceType === PaymentSourceType.C2C_BUY, '支付订单不是 C2C 买币来源')
    this.require(order.status === expected.orderStatus, '支付订单状态不允许执行当前支付方式')
    this.require(merchant.status === BusinessStatus.ACTIVE, '商家已停用')
    this.require(
      merchantOrder.status === expected.merchantOrderStatus,
      '商家订单状态不允许执行当前支付方式',
    )
    this.require(merchantOrder.payable, '商家订单当前不可付款')
    this.require(credential.status === BusinessStatus.ACTIVE, '商家平台凭据已停用')
    this.require(
      merchant.platform === merchantOrder.platform && merchant.platform === credential.platform,
      '商家平台配置不一致',
    )
    this.require(plan.status === BusinessStatus.ACTIVE, '支付方案已停用')
    this.require(account.status === BusinessStatus.ACTIVE, '支付账号已停用')
    this.require(accountChannel.status === BusinessStatus.ACTIVE, '支付账号通道已停用')
    this.require(channel.status === BusinessStatus.ACTIVE, '支付通道已停用')
    this.require(context.paymentPlatform.status === BusinessStatus.ACTIVE, '支付平台已停用')
    this.require(
      order.paymentPlanId === plan.id &&
        order.paymentAccountId === account.id &&
        order.paymentAccountChannelId === accountChannel.id &&
        plan.paymentAccountId === account.id &&
        plan.paymentAccountChannelId === accountChannel.id &&
        accountChannel.paymentAccountId === account.id &&
        accountChannel.channelId === channel.id &&
        account.platformId === channel.platformId &&
        account.platformId === context.paymentPlatform.id,
      '支付订单锁定的支付方案关系已失效',
    )
    this.require(
      context.paymentPlatform.code === 'ALIPAY' &&
        order.paymentMethod === 'ALIPAY' &&
        channel.adapterCode === expected.adapterCode &&
        channel.executionMode === expected.executionMode &&
        order.executionMode === expected.executionMode,
      expected.channelError,
    )
    this.require(this.sameAmount(order.amount, merchantOrder.fiatAmount), '商家订单金额已变化')
    this.require(order.currency === merchantOrder.fiatCurrency, '商家订单币种已变化')
    this.require(order.paymentMethod === merchantOrder.paymentMethod, '商家订单收款方式已变化')
    this.require(order.payeeIdentity === merchantOrder.payeeIdentity, '商家订单收款账号已变化')
    this.require(order.payeeName === merchantOrder.payeeName, '商家订单收款人已变化')
    this.require(Boolean(merchantOrder.platformPaymentMethodId), '商家订单缺少平台付款方式')
    this.require(Boolean(merchantOrder.paymentDeadline), '商家订单缺少明确付款截止时间')
    this.require(
      merchantOrder.paymentDeadline!.getTime() > now.getTime(),
      '商家订单付款截止时间已过',
    )
  }

  private verifyPlatform(
    context: PaymentPreflightConfiguration,
    current: C2cBuyOrderDetail,
    now: Date,
  ): void {
    const snapshot = context.merchantOrder
    this.require(current.status === C2cBuyOrderStatus.PENDING_PAYMENT, '平台订单已不可付款')
    this.require(current.payable, '平台订单当前不可付款')
    this.require(current.platformOrderId === snapshot.platformOrderId, '平台订单编号不匹配')
    this.require(this.sameAmount(current.fiatAmount, context.order.amount), '平台订单金额已变化')
    this.require(current.fiatCurrency === context.order.currency, '平台订单币种已变化')
    this.require(current.paymentMethod === context.order.paymentMethod, '平台订单收款方式已变化')
    this.require(current.payeeIdentity === context.order.payeeIdentity, '平台订单收款账号已变化')
    this.require(current.payeeName === context.order.payeeName, '平台订单收款人已变化')
    this.require(
      current.platformPaymentMethodId === snapshot.platformPaymentMethodId,
      '平台付款方式已变化',
    )
    this.require(Boolean(current.paymentDeadline), '平台订单缺少明确付款截止时间')
    const deadline = new Date(current.paymentDeadline!)
    this.require(!Number.isNaN(deadline.getTime()), '平台订单付款截止时间无效')
    this.require(
      deadline.getTime() === snapshot.paymentDeadline!.getTime(),
      '平台订单付款截止时间已变化',
    )
    this.require(deadline.getTime() > now.getTime(), '平台订单付款截止时间已过')
  }

  private getPlatformOrder(
    context: PaymentPreflightConfiguration,
    credentials: C2cPlatformCredentials,
  ): Promise<C2cBuyOrderDetail> {
    return this.platformClient.getOrderDetail(
      context.merchant.platform,
      credentials,
      context.order.sourceBusinessNo,
    )
  }

  private sameAmount(left: string, right: string): boolean {
    try {
      return normalizeCnyAmount(left) === normalizeCnyAmount(right)
    } catch {
      return false
    }
  }

  private require(condition: boolean, message: string): asserts condition {
    if (!condition) throw new PaymentNotSubmittedError(message)
  }

  private notSubmitted(error: unknown): PaymentNotSubmittedError {
    return error instanceof PaymentNotSubmittedError
      ? error
      : new PaymentNotSubmittedError(error instanceof Error ? error.message : String(error))
  }
}
