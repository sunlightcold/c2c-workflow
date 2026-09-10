import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderAppealStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentOrderStatus,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import {
  BinanceC2cClient,
  type BinanceComplaintReason,
  type BinanceCredentials,
  C2cBuyOrderStatus,
  C2cPlatformCredentialFactory,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'
import { C2cOrderService } from './c2c-order.service'

export const C2C_ORDER_APPEAL_STORE = Symbol('C2C_ORDER_APPEAL_STORE')

export type C2cOrderAppealClaimResult = 'CLAIMED' | 'PROCESSING' | 'SUBMITTED'

export interface C2cOrderAppealStore {
  claim: (
    tenantId: string,
    merchantId: string,
    orderId: string,
  ) => Promise<C2cOrderAppealClaimResult>
  setReason: (
    tenantId: string,
    merchantId: string,
    orderId: string,
    reasonCode: number,
    reason: string,
  ) => Promise<void>
  markSubmitted: (
    tenantId: string,
    merchantId: string,
    orderId: string,
    complaintNo: string,
  ) => Promise<void>
  releaseClaim: (
    tenantId: string,
    merchantId: string,
    orderId: string,
    error: string,
  ) => Promise<void>
  markSubmissionUncertain: (
    tenantId: string,
    merchantId: string,
    orderId: string,
    error: string,
  ) => Promise<void>
}

export interface SubmitC2cOrderAppealInput {
  description: string
  fileName: string
  receipt: Buffer
  reasonCode: number
}

@Injectable()
export class C2cOrderAppealService {
  constructor(
    private readonly orders: C2cOrderService,
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly binance: BinanceC2cClient,
    @Inject(C2C_ORDER_APPEAL_STORE) private readonly store: C2cOrderAppealStore,
  ) {}

  async getReasons(tenantId: string, merchantId: string, orderId: string) {
    const context = await this.requireEligibleOrder(tenantId, merchantId, orderId)
    const credentials = await this.resolveCredentials(tenantId, merchantId)
    await this.requireUpstreamPaid(credentials, context.platformOrderId)
    const reasons = await this.binance.getComplaintReasons(credentials, context.platformOrderId)
    return { orderNo: context.platformOrderId, reasons }
  }

  async submit(
    tenantId: string,
    merchantId: string,
    orderId: string,
    input: SubmitC2cOrderAppealInput,
  ) {
    const context = await this.requireEligibleOrder(tenantId, merchantId, orderId)
    const claim = await this.store.claim(tenantId, merchantId, orderId)
    if (claim === 'SUBMITTED') throw new BadRequestException('该商家订单已提交申诉')
    if (claim === 'PROCESSING') throw new ConflictException('该商家订单的申诉正在处理中')

    let credentials: BinanceCredentials
    let reason: BinanceComplaintReason
    let filePath: string
    try {
      credentials = await this.resolveCredentials(tenantId, merchantId)
      await this.requireUpstreamPaid(credentials, context.platformOrderId)
      const reasons = await this.binance.getComplaintReasons(credentials, context.platformOrderId)
      reason = this.requireReason(reasons, input.reasonCode)
      await this.store.setReason(
        tenantId,
        merchantId,
        orderId,
        reason.reasonCode,
        reason.reasonDesc,
      )
      const upload = await this.binance.getComplaintUploadUrl(credentials, input.fileName)
      await this.binance.uploadComplaintFile(upload.uploadUrl, input.receipt)
      filePath = upload.filePath
    } catch (error) {
      await this.store.releaseClaim(tenantId, merchantId, orderId, this.errorMessage(error))
      throw error
    }

    try {
      const result = await this.binance.submitComplaint(credentials, {
        description: input.description,
        fileUrls: [filePath],
        orderNo: context.platformOrderId,
        reason: reason.reasonDesc,
        reasonCode: reason.reasonCode,
      })
      const complaintNo = this.complaintNo(result.data.complaintNo)
      await this.store.markSubmitted(tenantId, merchantId, orderId, complaintNo)
      return {
        complaintNo,
        orderNo: context.platformOrderId,
        reason: reason.reasonDesc,
        reasonCode: reason.reasonCode,
      }
    } catch (error) {
      await this.store.markSubmissionUncertain(
        tenantId,
        merchantId,
        orderId,
        this.errorMessage(error),
      )
      throw new ServiceUnavailableException('申诉提交结果暂不确定，请勿重复提交')
    }
  }

  private async requireEligibleOrder(tenantId: string, merchantId: string, orderId: string) {
    const order = await this.orders.detail(tenantId, merchantId, orderId)
    const merchant = await this.merchants.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new BadRequestException('商家不存在')
    if (merchant.status !== BusinessStatus.ACTIVE) throw new BadRequestException('商家已停用')
    if (
      merchant.platform !== MerchantPlatform.BINANCE ||
      order.platform !== MerchantPlatform.BINANCE
    ) {
      throw new BadRequestException('当前仅支持币安商家订单申诉')
    }
    if (order.appealStatus === MerchantOrderAppealStatus.SUBMITTED) {
      throw new BadRequestException('该商家订单已提交申诉')
    }
    if (order.appealStatus === MerchantOrderAppealStatus.PROCESSING) {
      throw new ConflictException('该商家订单的申诉正在处理中')
    }
    if (order.status !== MerchantOrderStatus.PENDING_RELEASE) {
      throw new BadRequestException('只有待放行的商家订单可以申诉')
    }
    if (!order.paymentOrder || order.paymentOrder.status !== PaymentOrderStatus.COMPLETED) {
      throw new BadRequestException('商家订单支付完成后才可以申诉')
    }
    return order
  }

  private async resolveCredentials(
    tenantId: string,
    merchantId: string,
  ): Promise<BinanceCredentials> {
    const reference = await this.credentialService.getActiveReference(tenantId, merchantId)
    const secret = await this.secretResolver.resolve(reference.credentialRef)
    return this.credentialFactory.create(
      MerchantPlatform.BINANCE,
      reference,
      secret,
    ) as BinanceCredentials
  }

  private async requireUpstreamPaid(credentials: BinanceCredentials, platformOrderId: string) {
    const detail = await this.binance.getOrderDetail(credentials, platformOrderId)
    if (detail.status !== C2cBuyOrderStatus.PAID) {
      throw new BadRequestException('币安订单当前不是已付款待放行状态')
    }
  }

  private requireReason(reasons: BinanceComplaintReason[], reasonCode: number) {
    const reason = reasons.find((item) => item.reasonCode === reasonCode)
    if (!reason) throw new BadRequestException('申诉原因已失效，请刷新后重新选择')
    return reason
  }

  private complaintNo(value: string | number | undefined): string {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('币安未返回申诉单号')
    }
    const complaintNo = String(value).trim()
    if (!complaintNo) throw new Error('币安未返回申诉单号')
    return complaintNo
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
