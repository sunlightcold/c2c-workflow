import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  MerchantPaymentPlanEntity,
  MerchantPlatformCredentialEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentOrderEntity,
  PaymentPlatformEntity,
} from '@admin/database'
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { C2cBuyOrderStatus } from '../c2c-platform'
import type {
  PaymentPreflightConfiguration,
  PaymentPreflightStore,
} from './c2c-payment-preflight-verifier'
import { PaymentNotSubmittedError } from './payment-execution-coordinator'

@Injectable()
export class TypeOrmPaymentPreflightStore implements PaymentPreflightStore {
  constructor(private readonly dataSource: DataSource) {}

  async load(tenantId: string, orderId: string): Promise<PaymentPreflightConfiguration> {
    const orders = this.dataSource.getRepository(PaymentOrderEntity)
    const order = await orders.findOne({ where: { id: orderId, tenantId } })
    if (!order) throw new PaymentNotSubmittedError('支付订单不存在或不属于当前所属单位')
    const merchant = await this.dataSource
      .getRepository(MerchantEntity)
      .findOne({ where: { id: order.merchantId, tenantId } })
    if (!merchant) throw new PaymentNotSubmittedError('支付订单关联的商家不存在')
    const [merchantOrder, credential, plan, account, accountChannel] = await Promise.all([
      this.dataSource.getRepository(MerchantOrderEntity).findOne({
        where: {
          tenantId,
          merchantId: order.merchantId,
          platform: merchant.platform,
          platformOrderId: order.sourceBusinessNo,
        },
      }),
      this.dataSource
        .getRepository(MerchantPlatformCredentialEntity)
        .createQueryBuilder('credential')
        .addSelect('credential.credentialRef')
        .where('credential."tenantId" = :tenantId', { tenantId })
        .andWhere('credential."merchantId" = :merchantId', { merchantId: order.merchantId })
        .andWhere('credential.status = :status', { status: 'active' })
        .getOne(),
      order.paymentPlanId
        ? this.dataSource.getRepository(MerchantPaymentPlanEntity).findOne({
            where: { id: order.paymentPlanId, tenantId, merchantId: order.merchantId },
          })
        : null,
      order.paymentAccountId
        ? this.dataSource
            .getRepository(PaymentAccountEntity)
            .createQueryBuilder('account')
            .addSelect('account.credentialRef')
            .where('account.id = :accountId', { accountId: order.paymentAccountId })
            .andWhere('account."tenantId" = :tenantId', { tenantId })
            .getOne()
        : null,
      order.paymentAccountChannelId
        ? this.dataSource
            .getRepository(PaymentAccountChannelEntity)
            .findOne({ where: { id: order.paymentAccountChannelId } })
        : null,
    ])
    if (!merchantOrder) throw new PaymentNotSubmittedError('支付订单关联的商家订单不存在')
    if (!credential) throw new PaymentNotSubmittedError('商家没有生效的平台凭据')
    if (!plan || !account || !accountChannel)
      throw new PaymentNotSubmittedError('支付订单锁定的支付方案不完整')
    const [channel, paymentPlatform] = await Promise.all([
      this.dataSource
        .getRepository(PaymentChannelEntity)
        .findOne({ where: { id: accountChannel.channelId } }),
      this.dataSource
        .getRepository(PaymentPlatformEntity)
        .findOne({ where: { id: account.platformId } }),
    ])
    if (!channel || !paymentPlatform)
      throw new PaymentNotSubmittedError('支付订单锁定的支付通道不完整')
    return {
      order,
      merchant,
      merchantOrder,
      credential,
      plan,
      account,
      accountChannel,
      channel,
      paymentPlatform,
    }
  }

  transitionMerchantOrder(
    tenantId: string,
    merchantOrderId: string,
    status: MerchantOrderStatus,
    platformStatus: C2cBuyOrderStatus,
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MerchantOrderEntity)
      const order = await repository.findOne({
        where: { id: merchantOrderId, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!order) throw new ConflictException('商家订单不存在或不属于当前所属单位')
      if (order.status === status || this.isAlreadyBeyond(order.status, status)) return
      if (!this.canTransition(order.status, status))
        throw new ConflictException(`商家订单状态已变化: ${order.status}`)
      const previous = order.status
      order.status = status
      order.platformStatus = platformStatus
      order.payable = false
      order.lastError =
        status === MerchantOrderStatus.FUNDS_EXCEPTION
          ? `资金已支付，但平台订单状态为 ${platformStatus}`
          : null
      await repository.save(order)
      await manager.getRepository(MerchantOrderStatusHistoryEntity).save({
        tenantId: order.tenantId,
        merchantId: order.merchantId,
        merchantOrderId: order.id,
        fromStatus: previous,
        toStatus: status,
        source: 'PLATFORM_PAYMENT_CONFIRMATION',
        platformStatus,
        reason: order.lastError,
      })
    })
  }

  private canTransition(current: MerchantOrderStatus, next: MerchantOrderStatus): boolean {
    const allowed: Partial<Record<MerchantOrderStatus, readonly MerchantOrderStatus[]>> = {
      [MerchantOrderStatus.PENDING_PAYMENT]: [
        MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
        MerchantOrderStatus.FUNDS_EXCEPTION,
      ],
      [MerchantOrderStatus.PAYMENT_PROCESSING]: [
        MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
        MerchantOrderStatus.FUNDS_EXCEPTION,
      ],
      [MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM]: [
        MerchantOrderStatus.PENDING_RELEASE,
        MerchantOrderStatus.COMPLETED,
        MerchantOrderStatus.FUNDS_EXCEPTION,
      ],
      [MerchantOrderStatus.PENDING_RELEASE]: [
        MerchantOrderStatus.COMPLETED,
        MerchantOrderStatus.FUNDS_EXCEPTION,
      ],
      [MerchantOrderStatus.CANCELLED]: [MerchantOrderStatus.FUNDS_EXCEPTION],
      [MerchantOrderStatus.EXPIRED]: [MerchantOrderStatus.FUNDS_EXCEPTION],
      [MerchantOrderStatus.DISPUTED]: [MerchantOrderStatus.FUNDS_EXCEPTION],
      [MerchantOrderStatus.EXCEPTION]: [MerchantOrderStatus.FUNDS_EXCEPTION],
    }
    return allowed[current]?.includes(next) ?? false
  }

  private isAlreadyBeyond(current: MerchantOrderStatus, next: MerchantOrderStatus): boolean {
    const progress = [
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      MerchantOrderStatus.PENDING_RELEASE,
      MerchantOrderStatus.COMPLETED,
    ]
    return (
      progress.includes(current) &&
      progress.includes(next) &&
      progress.indexOf(current) > progress.indexOf(next)
    )
  }
}
