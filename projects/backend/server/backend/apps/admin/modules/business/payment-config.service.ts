import {
  BusinessStatus,
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentBatchPolicyEntity,
  PaymentBatchEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentExecutionMode,
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
import { BusinessNoPrefix, IdUtils } from '@/common/utils/id'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'

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
  batchPolicyId?: string | null
  merchantId: string
  paymentAccountId: string
  paymentAccountChannelId: string
  scene: string
  currency: string
  priority: number
  weight: number
}

export interface UpdatePaymentPlanInput {
  batchPolicyId?: string | null
  paymentAccountChannelId?: string
  paymentAccountId?: string
  priority?: number
  weight?: number
}

interface PaymentAccountChannelInput {
  maximumAmount?: string | null
  minimumAmount?: string | null
}

export interface PaymentAccountCredentialInput {
  alipayPublicKey?: string
  alipayPublicCertContent?: string
  alipayRootCertContent?: string
  appCertContent?: string
  appId: string
  authMode: 'CERT' | 'KEY'
  gateway: string
  privateKey: string
}

type PaymentAccountCredentialPatchInput = Pick<
  PaymentAccountCredentialInput,
  'appId' | 'authMode' | 'gateway'
> &
  Partial<
    Pick<
      PaymentAccountCredentialInput,
      | 'alipayPublicCertContent'
      | 'alipayPublicKey'
      | 'alipayRootCertContent'
      | 'appCertContent'
      | 'privateKey'
    >
  >

interface UpdatePaymentAccountInput {
  credential?: PaymentAccountCredentialPatchInput
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
    @InjectRepository(PaymentBatchPolicyEntity)
    private readonly batchPolicyRepository: Repository<PaymentBatchPolicyEntity>,
    private readonly dataSource: DataSource,
    private readonly cipher: CredentialCipherService,
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
        credentialAuthMode: account.credentialAuthMode,
        credentialAppId: account.credentialAppId,
        credentialGateway: account.credentialGateway,
        credentialUpdatedAt: account.credentialUpdatedAt,
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
      name: string
      externalAccountId: string
      credential: PaymentAccountCredentialInput
    },
  ) {
    const platform = await this.platformRepository.findOne({
      where: { id: input.platformId, status: BusinessStatus.ACTIVE },
    })
    if (!platform) throw new BadRequestException('支付平台不可用')
    if (platform.code !== 'ALIPAY') throw new BadRequestException('当前仅支持支付宝支付账号')
    const credential = this.normalizeCredential(input.credential)
    const { credential: _credential, ...accountInput } = input
    const account = await this.accountRepository.save(
      this.accountRepository.create({
        ...accountInput,
        tenantId,
        code: IdUtils.generateBusinessNo(BusinessNoPrefix.PAYMENT_ACCOUNT),
        credentialRef: this.encryptCredential(credential),
        credentialAuthMode: credential.authMode,
        credentialAppId: credential.appId,
        credentialGateway: credential.gateway,
        credentialUpdatedAt: new Date(),
        status: BusinessStatus.ACTIVE,
      }),
    )
    const { credentialRef: _credentialRef, ...response } = account
    return response
  }

  async updateAccount(tenantId: string, id: string, input: UpdatePaymentAccountInput) {
    const account = await this.accountRepository.findOne({ where: { id, tenantId } })
    if (!account) throw new NotFoundException('支付账号不存在')
    if (input.name !== undefined) account.name = input.name
    if (input.externalAccountId !== undefined) account.externalAccountId = input.externalAccountId
    if (input.credential) {
      const credential = this.mergeCredential(account.credentialRef, input.credential)
      account.credentialRef = this.encryptCredential(credential)
      account.credentialAuthMode = credential.authMode
      account.credentialAppId = credential.appId
      account.credentialGateway = credential.gateway
      account.credentialUpdatedAt = new Date()
    }
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
        minimumAmount: input.minimumAmount ?? null,
        maximumAmount: input.maximumAmount ?? null,
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
    if (input.minimumAmount !== undefined) binding.minimumAmount = input.minimumAmount
    if (input.maximumAmount !== undefined) binding.maximumAmount = input.maximumAmount
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

  async updatePlan(tenantId: string, id: string, input: UpdatePaymentPlanInput) {
    const plan = await this.planRepository.findOne({ where: { id, tenantId } })
    if (!plan) throw new NotFoundException('支付方案不存在')

    const routeChanged =
      input.paymentAccountId !== undefined || input.paymentAccountChannelId !== undefined
    if (routeChanged || input.batchPolicyId !== undefined) {
      if (!input.paymentAccountId || !input.paymentAccountChannelId) {
        if (routeChanged) throw new BadRequestException('支付账号与支付通道必须同时选择')
      }
      await this.requireActivePlanRoute(
        tenantId,
        plan.merchantId,
        input.paymentAccountId ?? plan.paymentAccountId,
        input.paymentAccountChannelId ?? plan.paymentAccountChannelId,
        input.batchPolicyId === undefined ? plan.batchPolicyId : input.batchPolicyId,
      )
      if (input.paymentAccountId) plan.paymentAccountId = input.paymentAccountId
      if (input.paymentAccountChannelId) {
        plan.paymentAccountChannelId = input.paymentAccountChannelId
      }
      if (input.batchPolicyId !== undefined) plan.batchPolicyId = input.batchPolicyId
    }
    if (input.priority !== undefined) plan.priority = input.priority
    if (input.weight !== undefined) plan.weight = input.weight
    return this.planRepository.save(plan)
  }

  async removePlan(tenantId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const planRepository = manager.getRepository(MerchantPaymentPlanEntity)
      const plan = await planRepository.findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!plan) throw new NotFoundException('支付方案不存在')

      const referenced = await manager.getRepository(PaymentOrderEntity).exists({
        where: { tenantId, paymentPlanId: id },
      })
      if (referenced) {
        throw new ConflictException('支付方案已被支付订单使用，不能删除，可停用该方案')
      }
      await planRepository.delete({ id, tenantId })
    })
  }

  async setPlanStatus(tenantId: string, id: string, status: BusinessStatus) {
    const plan = await this.planRepository.findOne({ where: { id, tenantId } })
    if (!plan) throw new NotFoundException('支付方案不存在')
    if (status === BusinessStatus.ACTIVE) {
      await this.requireActivePlanRoute(
        tenantId,
        plan.merchantId,
        plan.paymentAccountId,
        plan.paymentAccountChannelId,
        plan.batchPolicyId,
      )
    }
    plan.status = status
    return this.planRepository.save(plan)
  }

  async createPlan(tenantId: string, input: CreatePaymentPlanInput) {
    await this.requireActivePlanRoute(
      tenantId,
      input.merchantId,
      input.paymentAccountId,
      input.paymentAccountChannelId,
      input.batchPolicyId ?? null,
    )
    return this.planRepository.save(
      this.planRepository.create({
        ...input,
        tenantId,
        status: BusinessStatus.ACTIVE,
      }),
    )
  }

  private async requireActivePlanRoute(
    tenantId: string,
    merchantId: string,
    paymentAccountId: string,
    paymentAccountChannelId: string,
    batchPolicyId: string | null,
  ): Promise<void> {
    const [merchant, account, accountChannel] = await Promise.all([
      this.merchantRepository.findOne({ where: { id: merchantId, tenantId } }),
      this.accountRepository.findOne({ where: { id: paymentAccountId, tenantId } }),
      this.accountChannelRepository.findOne({ where: { id: paymentAccountChannelId } }),
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
    const channel = await this.channelRepository.findOne({
      where: { id: accountChannel.channelId, status: BusinessStatus.ACTIVE },
    })
    if (!channel) throw new BadRequestException('支付通道不可用')
    if (channel.executionMode === PaymentExecutionMode.BATCH) {
      if (!batchPolicyId) throw new BadRequestException('批量支付方案必须选择批次策略')
      const policy = await this.batchPolicyRepository.findOne({
        where: { id: batchPolicyId, tenantId, status: BusinessStatus.ACTIVE },
      })
      if (!policy || (policy.merchantId !== null && policy.merchantId !== merchantId)) {
        throw new BadRequestException('批次策略不可用或不适用于当前商家')
      }
    } else if (batchPolicyId) {
      throw new BadRequestException('单笔支付方案不能选择批次策略')
    }
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

  private encryptCredential(credential: PaymentAccountCredentialInput): string {
    return `enc://${this.cipher.encrypt(JSON.stringify(credential))}`
  }

  private mergeCredential(
    credentialRef: string,
    patch: PaymentAccountCredentialPatchInput,
  ): PaymentAccountCredentialInput {
    const suppliedSecrets = Object.fromEntries(
      Object.entries(patch).filter(
        ([key, value]) =>
          !['appId', 'authMode', 'gateway'].includes(key) &&
          typeof value === 'string' &&
          value.trim() !== '',
      ),
    )
    let current: Partial<PaymentAccountCredentialInput> = {}
    if (credentialRef.startsWith('enc://')) {
      try {
        current = JSON.parse(this.cipher.decrypt(credentialRef.slice(6)))
      } catch {
        throw new BadRequestException('现有支付宝凭据无法读取，请重新填写完整凭据')
      }
    }
    const merged = {
      ...current,
      authMode: patch.authMode,
      appId: patch.appId,
      gateway: patch.gateway,
      ...suppliedSecrets,
    }
    return this.normalizeCredential({
      authMode: patch.authMode,
      appId: patch.appId,
      gateway: patch.gateway,
      privateKey: merged.privateKey ?? '',
      alipayPublicKey: merged.alipayPublicKey,
      appCertContent: merged.appCertContent,
      alipayPublicCertContent: merged.alipayPublicCertContent,
      alipayRootCertContent: merged.alipayRootCertContent,
    })
  }

  private normalizeCredential(input: PaymentAccountCredentialInput): PaymentAccountCredentialInput {
    const common = {
      authMode: input.authMode,
      appId: input.appId.trim(),
      gateway: input.gateway.trim(),
      privateKey: input.privateKey.trim(),
    }
    if (!common.appId || !common.privateKey) {
      throw new BadRequestException('支付宝应用 ID 和应用私钥不能为空')
    }
    if (input.authMode === 'KEY') {
      const alipayPublicKey = input.alipayPublicKey?.trim()
      if (!alipayPublicKey) throw new BadRequestException('支付宝公钥未配置')
      return { ...common, authMode: 'KEY', alipayPublicKey }
    }
    const appCertContent = input.appCertContent?.trim()
    const alipayPublicCertContent = input.alipayPublicCertContent?.trim()
    const alipayRootCertContent = input.alipayRootCertContent?.trim()
    if (!appCertContent || !alipayPublicCertContent || !alipayRootCertContent) {
      throw new BadRequestException('支付宝证书配置不完整')
    }
    return {
      ...common,
      authMode: 'CERT',
      appCertContent,
      alipayPublicCertContent,
      alipayRootCertContent,
    }
  }

  private sanitizeChannel(binding: PaymentAccountChannelEntity) {
    const { concurrencyLimit: _concurrencyLimit, configRef: _configRef, ...response } = binding
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
