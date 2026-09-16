import { BusinessStatus, MerchantEntity, PlatformConfirmationStatus } from '@admin/database'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { C2cMerchantPaymentService } from '../payment/c2c-merchant-payment.service'
import { formatActionResultMessage } from './telegram-notification.formatter'

export interface TelegramC2cOrderActionInput {
  merchantId: string
  operator: string
  orderId: string
  tenantId: string
}

@Injectable()
export class TelegramC2cOrderActionService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    private readonly payments: C2cMerchantPaymentService,
  ) {}

  async confirm(input: TelegramC2cOrderActionInput) {
    const merchant = await this.merchants.findOne({
      where: {
        id: input.merchantId,
        tenantId: input.tenantId,
        status: BusinessStatus.ACTIVE,
      },
    })
    if (!merchant) throw new BadRequestException('商家不可用或不属于当前所属单位')
    const payment = await this.payments.createAfterManualReview(
      input.tenantId,
      input.merchantId,
      input.orderId,
      input.operator,
    )
    return {
      parseMode: 'HTML' as const,
      text: formatActionResultMessage({
        title: 'C2C订单已创建',
        platformOrderId: payment.sourceBusinessNo,
        paymentNo: payment.paymentNo,
        status: payment.status,
      }),
    }
  }

  async cancel(input: TelegramC2cOrderActionInput) {
    const order = await this.payments.cancel(
      input.tenantId,
      input.merchantId,
      input.orderId,
      input.operator,
      'Telegram 人工作废',
    )
    return {
      parseMode: 'HTML' as const,
      text: formatActionResultMessage({
        title: 'C2C订单已作废',
        platformOrderId: order.platformOrderId,
        status: 'CANCELLED',
      }),
    }
  }

  async retryConfirmPaid(input: TelegramC2cOrderActionInput) {
    const merchant = await this.merchants.findOne({
      where: {
        id: input.merchantId,
        tenantId: input.tenantId,
        status: BusinessStatus.ACTIVE,
      },
    })
    if (!merchant) throw new BadRequestException('商家不可用或不属于当前所属单位')
    const payment = await this.payments.confirmPaid(input.tenantId, input.merchantId, input.orderId)
    return {
      parseMode: 'HTML' as const,
      text: formatActionResultMessage({
        title:
          payment.platformConfirmStatus === PlatformConfirmationStatus.SUCCESS
            ? 'C2C 标记付款成功'
            : 'C2C 标记付款失败',
        platformOrderId: payment.sourceBusinessNo,
        paymentNo: payment.paymentNo,
        status: payment.platformConfirmStatus,
        reason: payment.platformConfirmLastError,
      }),
    }
  }
}
