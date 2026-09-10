import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantPaymentPlanEntity,
  MerchantPlatformCredentialEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentOrderEntity,
  PaymentPlatformEntity,
} from '@admin/database'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
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
            .findOne({ where: { id: order.paymentAccountId, tenantId } })
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
}
