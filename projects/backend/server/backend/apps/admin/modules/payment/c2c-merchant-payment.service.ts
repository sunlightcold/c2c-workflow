import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
  PlatformConfirmationStatus,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { decimal } from '@/common/utils/decimal'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import {
  C2cBuyOrderStatus,
  C2cPlatformClient,
  C2cPlatformCredentialFactory,
  type C2cBuyOrderDetail,
} from '../c2c-platform'
import { C2cOrderService } from '../c2c-order/c2c-order.service'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from '../c2c-order/c2c-secret-resolver'
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
    @InjectRepository(MerchantEntity) private readonly merchants: Repository<MerchantEntity>,
    private readonly credentials: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
    @Optional() private readonly platformChat?: C2cPlatformChatService,
  ) {}

  async create(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    automaticOnly = false,
  ) {
    return this.createFromOrder(tenantId, merchantId, merchantOrderId, false, automaticOnly)
  }

  async createAfterManualReview(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    operator: string,
  ) {
    return this.createFromOrder(tenantId, merchantId, merchantOrderId, true, false, operator)
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
    allowIdentityMismatch: boolean,
    automaticOnly: boolean,
    operator?: string,
  ) {
    const merchantOrder = await this.merchantOrders.detail(tenantId, merchantId, merchantOrderId)
    this.assertPayable(merchantOrder, allowIdentityMismatch)
    if (allowIdentityMismatch) await this.verifyManualReview(tenantId, merchantId, merchantOrder)
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
    const paymentOrder = allowIdentityMismatch
      ? await this.paymentOrders.create(tenantId, paymentInput, {
          automaticOnly,
          source: 'TELEGRAM_C2C_REVIEW',
          reason: `实名不一致订单已由 ${operator || 'Telegram 操作员'} 人工确认`,
          requireRoute: true,
        })
      : await this.paymentOrders.create(tenantId, paymentInput, {
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

  private async verifyManualReview(
    tenantId: string,
    merchantId: string,
    order: Awaited<ReturnType<C2cOrderService['detail']>>,
  ): Promise<void> {
    if (order.identityMatched || order.kycStatus !== 'PASS' || !order.platformPaymentMethodId) {
      throw new BadRequestException('订单不符合实名不一致人工确认条件')
    }
    if (order.paymentDeadline && order.paymentDeadline <= new Date()) {
      throw new BadRequestException('商家订单付款期限已过')
    }
    const merchant = await this.merchants.findOne({
      where: { id: merchantId, tenantId, status: BusinessStatus.ACTIVE },
    })
    if (!merchant || merchant.platform !== order.platform) {
      throw new BadRequestException('商家平台配置已变化')
    }
    const reference = await this.credentials.getActiveReference(tenantId, merchantId)
    const secret = await this.secretResolver.resolve(reference.credentialRef)
    const credentials = this.credentialFactory.create(merchant.platform, reference, secret)
    const detail = await this.platformClient.getOrderDetail(
      merchant.platform,
      credentials,
      order.platformOrderId,
    )
    this.assertManualReviewDetail(order, detail)
  }

  private assertManualReviewDetail(
    order: Awaited<ReturnType<C2cOrderService['detail']>>,
    detail: C2cBuyOrderDetail,
  ): void {
    if (detail.platformOrderId !== order.platformOrderId || detail.side !== 'BUY') {
      throw new BadRequestException('平台订单编号或交易方向已变化')
    }
    if (detail.status !== C2cBuyOrderStatus.PENDING_PAYMENT || !detail.payable) {
      throw new BadRequestException('平台订单已不可付款')
    }
    if (detail.paymentDeadline && new Date(detail.paymentDeadline) <= new Date()) {
      throw new BadRequestException('平台订单付款期限已过')
    }
    if (
      detail.fiatCurrency !== order.fiatCurrency ||
      !decimal(detail.fiatAmount).eq(decimal(order.fiatAmount))
    ) {
      throw new BadRequestException('平台订单金额已变化')
    }
    if (detail.paymentMethod !== order.paymentMethod) {
      throw new BadRequestException('平台订单付款方式已变化')
    }
    if (detail.payeeIdentity !== order.payeeIdentity) {
      throw new BadRequestException('平台订单收款账号已变化')
    }
    if (!this.sameName(detail.identityName, order.identityName)) {
      throw new BadRequestException('平台订单收款姓名已变化')
    }
  }

  private sameName(left: string | null, right: string | null): boolean {
    return Boolean(left && right) && this.normalizeName(left!) === this.normalizeName(right!)
  }

  private normalizeName(value: string): string {
    return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, '').toLocaleLowerCase()
  }

  private assertPayable(
    order: {
      status: MerchantOrderStatus
      payable: boolean
      identityMatched: boolean
      paymentMethod: string | null
      identityName: string | null
      paymentOrder?: { status: PaymentOrderStatus } | null
      payeeIdentity: string | null
      payeeName: string | null
    },
    allowIdentityMismatch = false,
  ): void {
    if (order.status !== MerchantOrderStatus.PENDING_PAYMENT || !order.payable) {
      throw new BadRequestException('商家订单当前不可支付')
    }
    if (order.paymentOrder) {
      throw new ConflictException('商家订单已存在支付订单，请在支付订单中处理')
    }
    if (!allowIdentityMismatch && !order.identityMatched)
      throw new BadRequestException('收款人与平台实名不一致')
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
