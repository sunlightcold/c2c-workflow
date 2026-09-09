import {
  BusinessStatus,
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
} from '@admin/database'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

export interface CreatePaymentPlanInput {
  merchantId: string
  paymentAccountId: string
  paymentAccountChannelId: string
  scene: string
  currency: string
  priority: number
  weight: number
}

@Injectable()
export class PaymentConfigService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchantRepository: Repository<MerchantEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly accountRepository: Repository<PaymentAccountEntity>,
    @InjectRepository(PaymentAccountChannelEntity)
    private readonly accountChannelRepository: Repository<PaymentAccountChannelEntity>,
    @InjectRepository(MerchantPaymentPlanEntity)
    private readonly planRepository: Repository<MerchantPaymentPlanEntity>,
    @InjectRepository(PaymentPlatformEntity)
    private readonly platformRepository: Repository<PaymentPlatformEntity>,
    @InjectRepository(PaymentChannelEntity)
    private readonly channelRepository: Repository<PaymentChannelEntity>,
  ) {}

  async createAccount(
    tenantId: string,
    input: {
      platformId: string
      code: string
      name: string
      externalAccountId: string
      credentialRef: string
    },
  ) {
    const platform = await this.platformRepository.findOne({
      where: { id: input.platformId, status: BusinessStatus.ACTIVE },
    })
    if (!platform) throw new BadRequestException('支付平台不可用')
    return this.accountRepository.save(
      this.accountRepository.create({ ...input, tenantId, status: BusinessStatus.ACTIVE }),
    )
  }

  async openAccountChannel(
    tenantId: string,
    paymentAccountId: string,
    input: { channelId: string; configRef?: string },
  ) {
    const [account, channel] = await Promise.all([
      this.accountRepository.findOne({ where: { id: paymentAccountId, tenantId } }),
      this.channelRepository.findOne({
        where: { id: input.channelId, status: BusinessStatus.ACTIVE },
      }),
    ])
    if (!account) throw new BadRequestException('支付账号不属于当前所属单位')
    if (!channel || channel.platformId !== account.platformId)
      throw new BadRequestException('支付通道不属于支付账号的平台')
    return this.accountChannelRepository.save(
      this.accountChannelRepository.create({
        paymentAccountId,
        channelId: channel.id,
        configRef: input.configRef ?? null,
        minimumAmount: null,
        maximumAmount: null,
        concurrencyLimit: 1,
        status: BusinessStatus.ACTIVE,
      }),
    )
  }

  async createPlan(tenantId: string, input: CreatePaymentPlanInput) {
    const [merchant, account, accountChannel] = await Promise.all([
      this.merchantRepository.findOne({ where: { id: input.merchantId, tenantId } }),
      this.accountRepository.findOne({ where: { id: input.paymentAccountId, tenantId } }),
      this.accountChannelRepository.findOne({ where: { id: input.paymentAccountChannelId } }),
    ])
    if (!merchant) throw new BadRequestException('商家不属于当前所属单位')
    if (!account || account.status !== BusinessStatus.ACTIVE)
      throw new BadRequestException('支付账号不可用或不属于当前所属单位')
    if (
      !accountChannel ||
      accountChannel.paymentAccountId !== account.id ||
      accountChannel.status !== BusinessStatus.ACTIVE
    ) {
      throw new BadRequestException('支付通道未在所选支付账号下启用')
    }
    return this.planRepository.save(
      this.planRepository.create({
        ...input,
        tenantId,
        status: BusinessStatus.ACTIVE,
      }),
    )
  }
}
