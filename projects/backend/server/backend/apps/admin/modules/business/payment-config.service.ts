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
import { In, Repository } from 'typeorm'

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

  async listCatalog() {
    const [platforms, channels] = await Promise.all([
      this.platformRepository.find({ order: { code: 'ASC' } }),
      this.channelRepository.find({ order: { platformId: 'ASC', code: 'ASC' } }),
    ])
    return platforms.map((platform) => ({
      id: platform.id,
      code: platform.code,
      name: platform.name,
      status: platform.status,
      channels: channels
        .filter(({ platformId }) => platformId === platform.id)
        .map((channel) => ({
          id: channel.id,
          code: channel.code,
          name: channel.name,
          executionMode: channel.executionMode,
          adapterCode: channel.adapterCode,
          status: channel.status,
        })),
    }))
  }

  async listAccounts(tenantId: string) {
    const accounts = await this.accountRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    })
    if (!accounts.length) return []
    const accountIds = accounts.map(({ id }) => id)
    const accountChannels = await this.accountChannelRepository
      .createQueryBuilder('account_channel')
      .innerJoin(PaymentAccountEntity, 'account', 'account.id = account_channel."paymentAccountId"')
      .where('account."tenantId" = :tenantId', { tenantId })
      .andWhere('account_channel."paymentAccountId" IN (:...accountIds)', { accountIds })
      .orderBy('account_channel."createdAt"', 'ASC')
      .getMany()
    const channelIds = [...new Set(accountChannels.map(({ channelId }) => channelId))]
    const channels = channelIds.length
      ? await this.channelRepository.find({ where: { id: In(channelIds) } })
      : []
    const channelById = new Map(channels.map((channel) => [channel.id, channel]))
    return accounts.map((account) => ({
      id: account.id,
      tenantId: account.tenantId,
      platformId: account.platformId,
      code: account.code,
      name: account.name,
      externalAccountId: account.externalAccountId,
      credentialConfigured: true,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      channels: accountChannels
        .filter(({ paymentAccountId }) => paymentAccountId === account.id)
        .map((binding) => {
          const channel = channelById.get(binding.channelId)
          return {
            id: binding.id,
            channelId: binding.channelId,
            channelCode: channel?.code ?? null,
            channelName: channel?.name ?? null,
            executionMode: channel?.executionMode ?? null,
            adapterCode: channel?.adapterCode ?? null,
            minimumAmount: binding.minimumAmount,
            maximumAmount: binding.maximumAmount,
            concurrencyLimit: binding.concurrencyLimit,
            status: binding.status,
          }
        }),
    }))
  }

  listPlans(tenantId: string, merchantId?: string) {
    return this.planRepository.find({
      where: { tenantId, ...(merchantId ? { merchantId } : {}) },
      order: { merchantId: 'ASC', priority: 'ASC', createdAt: 'ASC' },
    })
  }

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
    const account = await this.accountRepository.save(
      this.accountRepository.create({ ...input, tenantId, status: BusinessStatus.ACTIVE }),
    )
    const { credentialRef: _credentialRef, ...response } = account
    return response
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
