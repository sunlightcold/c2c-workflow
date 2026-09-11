import {
  BusinessStatus,
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentBatchEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
  PaymentOrderEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, ILike, In, Repository } from 'typeorm'

export interface PaymentAccountListInput {
  accountCode?: string
  accountName?: string
  externalAccountId?: string
  page: number
  pageSize: number
  platformId?: string
  status?: BusinessStatus
}

export interface CreatePaymentPlanInput {
  merchantId: string
  paymentAccountId: string
  paymentAccountChannelId: string
  scene: string
  currency: string
  priority: number
  weight: number
}

interface PaymentAccountChannelInput {
  concurrencyLimit?: number
  configRef?: string
  maximumAmount?: string | null
  minimumAmount?: string | null
}

interface UpdatePaymentAccountInput {
  credentialRef?: string
  externalAccountId?: string
  name?: string
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
    private readonly dataSource: DataSource,
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

  async listAccounts(tenantId: string, input: PaymentAccountListInput) {
    const [accounts, total] = await this.accountRepository.findAndCount({
      where: {
        tenantId,
        ...(input.accountName ? { name: ILike(`%${input.accountName}%`) } : {}),
        ...(input.accountCode ? { code: ILike(`%${input.accountCode}%`) } : {}),
        ...(input.externalAccountId
          ? { externalAccountId: ILike(`%${input.externalAccountId}%`) }
          : {}),
        ...(input.platformId ? { platformId: input.platformId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    if (!accounts.length) return { items: [], total, page: input.page, pageSize: input.pageSize }
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
    return {
      items: accounts.map((account) => ({
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
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
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

  async updateAccount(tenantId: string, id: string, input: UpdatePaymentAccountInput) {
    const account = await this.accountRepository.findOne({ where: { id, tenantId } })
    if (!account) throw new NotFoundException('支付账号不存在')
    if (input.name !== undefined) account.name = input.name
    if (input.externalAccountId !== undefined) account.externalAccountId = input.externalAccountId
    if (input.credentialRef !== undefined) account.credentialRef = input.credentialRef
    return this.sanitizeAccount(await this.accountRepository.save(account))
  }

  async setAccountStatus(tenantId: string, id: string, status: BusinessStatus) {
    const account = await this.accountRepository.findOne({ where: { id, tenantId } })
    if (!account) throw new NotFoundException('支付账号不存在')
    account.status = status
    return this.sanitizeAccount(await this.accountRepository.save(account))
  }

  async removeAccount(tenantId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const accountRepository = manager.getRepository(PaymentAccountEntity)
      const account = await accountRepository.findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!account) throw new NotFoundException('支付账号不存在')
      const referenced = await this.accountIsReferenced(manager, tenantId, id)
      if (referenced) {
        throw new ConflictException(
          '支付账号已被支付方案、支付订单或支付批次使用，不能删除，可停用该账号',
        )
      }
      await manager.getRepository(PaymentAccountChannelEntity).delete({ paymentAccountId: id })
      await accountRepository.delete({ id, tenantId })
    })
  }

  async openAccountChannel(
    tenantId: string,
    paymentAccountId: string,
    input: PaymentAccountChannelInput & { channelId: string },
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
    this.validateAmountRange(input.minimumAmount, input.maximumAmount)
    const binding = await this.accountChannelRepository.save(
      this.accountChannelRepository.create({
        paymentAccountId,
        channelId: channel.id,
        configRef: input.configRef ?? null,
        minimumAmount: input.minimumAmount ?? null,
        maximumAmount: input.maximumAmount ?? null,
        concurrencyLimit: input.concurrencyLimit ?? 1,
        status: BusinessStatus.ACTIVE,
      }),
    )
    return this.sanitizeChannel(binding)
  }

  async updateAccountChannel(
    tenantId: string,
    paymentAccountId: string,
    bindingId: string,
    input: PaymentAccountChannelInput,
  ) {
    await this.requireTenantAccount(tenantId, paymentAccountId)
    const binding = await this.accountChannelRepository.findOne({
      where: { id: bindingId, paymentAccountId },
    })
    if (!binding) throw new NotFoundException('支付账号通道不存在')
    const minimumAmount =
      input.minimumAmount === undefined ? binding.minimumAmount : input.minimumAmount
    const maximumAmount =
      input.maximumAmount === undefined ? binding.maximumAmount : input.maximumAmount
    this.validateAmountRange(minimumAmount, maximumAmount)
    if (input.configRef !== undefined) binding.configRef = input.configRef
    if (input.minimumAmount !== undefined) binding.minimumAmount = input.minimumAmount
    if (input.maximumAmount !== undefined) binding.maximumAmount = input.maximumAmount
    if (input.concurrencyLimit !== undefined) binding.concurrencyLimit = input.concurrencyLimit
    return this.sanitizeChannel(await this.accountChannelRepository.save(binding))
  }

  async setAccountChannelStatus(
    tenantId: string,
    paymentAccountId: string,
    bindingId: string,
    status: BusinessStatus,
  ) {
    const account = await this.requireTenantAccount(tenantId, paymentAccountId)
    if (status === BusinessStatus.ACTIVE && account.status !== BusinessStatus.ACTIVE) {
      throw new BadRequestException('支付账号停用时不能启用支付通道')
    }
    const binding = await this.accountChannelRepository.findOne({
      where: { id: bindingId, paymentAccountId },
    })
    if (!binding) throw new NotFoundException('支付账号通道不存在')
    binding.status = status
    return this.sanitizeChannel(await this.accountChannelRepository.save(binding))
  }

  async removeAccountChannel(
    tenantId: string,
    paymentAccountId: string,
    bindingId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const account = await manager.getRepository(PaymentAccountEntity).findOne({
        where: { id: paymentAccountId, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!account) throw new NotFoundException('支付账号不存在')
      const bindingRepository = manager.getRepository(PaymentAccountChannelEntity)
      const binding = await bindingRepository.findOne({
        where: { id: bindingId, paymentAccountId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!binding) throw new NotFoundException('支付账号通道不存在')
      const referenced = await this.channelIsReferenced(manager, tenantId, bindingId)
      if (referenced) {
        throw new ConflictException(
          '支付账号通道已被支付方案、支付订单或支付批次使用，不能移除，可停用该通道',
        )
      }
      await bindingRepository.delete({ id: bindingId, paymentAccountId })
    })
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

  private async requireTenantAccount(tenantId: string, id: string) {
    const account = await this.accountRepository.findOne({ where: { id, tenantId } })
    if (!account) throw new NotFoundException('支付账号不存在')
    return account
  }

  private sanitizeAccount(account: PaymentAccountEntity) {
    const { credentialRef: _credentialRef, ...response } = account
    return response
  }

  private sanitizeChannel(binding: PaymentAccountChannelEntity) {
    const { configRef: _configRef, ...response } = binding
    return response
  }

  private validateAmountRange(minimum?: string | null, maximum?: string | null): void {
    if (!minimum || !maximum) return
    if (this.amountInCents(minimum) > this.amountInCents(maximum)) {
      throw new BadRequestException('最小支付金额不能大于最大支付金额')
    }
  }

  private amountInCents(value: string): bigint {
    const [integer, decimal = ''] = value.split('.')
    return BigInt(integer) * 100n + BigInt(decimal.padEnd(2, '0'))
  }

  private async accountIsReferenced(manager: DataSource['manager'], tenantId: string, id: string) {
    const [plan, order, batch] = await Promise.all([
      manager.getRepository(MerchantPaymentPlanEntity).exists({
        where: { tenantId, paymentAccountId: id },
      }),
      manager.getRepository(PaymentOrderEntity).exists({
        where: { tenantId, paymentAccountId: id },
      }),
      manager.getRepository(PaymentBatchEntity).exists({
        where: { tenantId, paymentAccountId: id },
      }),
    ])
    return plan || order || batch
  }

  private async channelIsReferenced(manager: DataSource['manager'], tenantId: string, id: string) {
    const [plan, order, batch] = await Promise.all([
      manager.getRepository(MerchantPaymentPlanEntity).exists({
        where: { tenantId, paymentAccountChannelId: id },
      }),
      manager.getRepository(PaymentOrderEntity).exists({
        where: { tenantId, paymentAccountChannelId: id },
      }),
      manager.getRepository(PaymentBatchEntity).exists({
        where: { tenantId, paymentAccountChannelId: id },
      }),
    ])
    return plan || order || batch
  }
}
