import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderEntity,
  MerchantPlatform,
  MerchantPlatformCredentialEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, ILike, Repository } from 'typeorm'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'

export interface CreateMerchantInput {
  code: string
  name: string
  platform: MerchantPlatform
  externalMerchantId: string
  apiBaseUrl?: string
  authMode?: 'API_KEY' | 'WEB_COOKIE'
  apiKey?: string
  secretKey?: string
  sessionCookie?: string
  authorization?: string
  clientType?: string
  xUserId?: string
  pageSize?: number
  overlapSeconds?: number
  orderStatusList?: number[]
  requestTimeoutMs?: number
  paidConfirmIntervalMinMs?: number
  paidConfirmIntervalMaxMs?: number
  botCode?: string
  chatId?: string
  c2cChatOrderCreatedEnabled?: boolean
  c2cChatOrderCreatedMessage?: string
  c2cChatOrderPaidEnabled?: boolean
  c2cChatOrderPaidMessage?: string
  c2cChatOrderCompletedEnabled?: boolean
  c2cChatOrderCompletedMessage?: string
  autoAppealEnabled?: boolean
  autoAppealDelayMinutes?: number
  description?: string
}

export interface MerchantListInput {
  accountName?: string
  accountCode?: string
  externalMerchantId?: string
  platform?: MerchantPlatform
  status?: BusinessStatus
  page: number
  pageSize: number
}

type UpdateMerchantInput = Partial<
  Omit<
    CreateMerchantInput,
    'apiKey' | 'authMode' | 'authorization' | 'code' | 'platform' | 'secretKey' | 'sessionCookie'
  >
>

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly repository: Repository<MerchantEntity>,
    @InjectRepository(MerchantPlatformCredentialEntity)
    private readonly credentialRepository: Repository<MerchantPlatformCredentialEntity>,
    private readonly dataSource: DataSource,
    private readonly cipher: CredentialCipherService,
  ) {}

  async list(tenantId: string, input: MerchantListInput) {
    const [items, total] = await this.repository.findAndCount({
      where: {
        tenantId,
        ...(input.accountName ? { name: ILike(`%${input.accountName}%`) } : {}),
        ...(input.accountCode ? { code: ILike(`%${input.accountCode}%`) } : {}),
        ...(input.externalMerchantId
          ? { externalMerchantId: ILike(`%${input.externalMerchantId}%`) }
          : {}),
        ...(input.platform ? { platform: input.platform } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    const credentials = items.length
      ? await this.credentialRepository.find({
          where: { tenantId, status: BusinessStatus.ACTIVE },
          select: { merchantId: true, authMode: true },
        })
      : []
    const byMerchant = new Map(credentials.map((credential) => [credential.merchantId, credential]))
    return {
      items: items.map((item) => ({
        ...item,
        authMode: byMerchant.get(item.id)?.authMode ?? null,
        credentialConfigured: byMerchant.has(item.id),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  create(tenantId: string, input: CreateMerchantInput) {
    const authMode = input.authMode ?? this.defaultAuthMode(input.platform)
    this.validateAccount(input.platform, authMode, input)
    const requestTimeoutMs = input.requestTimeoutMs ?? 15000
    const apiBaseUrl = this.normalizeBaseUrl(
      input.apiBaseUrl ?? this.defaultBaseUrl(input.platform),
    )
    this.validatePaidInterval(
      input.paidConfirmIntervalMinMs ?? 0,
      input.paidConfirmIntervalMaxMs ?? 0,
    )
    return this.dataSource.transaction(async (manager) => {
      const merchants = manager.getRepository(MerchantEntity)
      const merchant = await merchants.save(
        merchants.create({
          tenantId,
          code: input.code,
          name: input.name,
          platform: input.platform,
          externalMerchantId: input.externalMerchantId,
          apiBaseUrl,
          pageSize: this.valueOr(input.pageSize, 20),
          overlapSeconds: this.valueOr(input.overlapSeconds, 120),
          orderStatusList: input.orderStatusList?.length ? input.orderStatusList : [1],
          requestTimeoutMs,
          paidConfirmIntervalMinMs: this.valueOr(input.paidConfirmIntervalMinMs, 0),
          paidConfirmIntervalMaxMs: this.valueOr(input.paidConfirmIntervalMaxMs, 0),
          botCode: this.valueOr(input.botCode, null),
          chatId: this.valueOr(input.chatId, null),
          c2cChatOrderCreatedEnabled: this.valueOr(input.c2cChatOrderCreatedEnabled, false),
          c2cChatOrderCreatedMessage: this.valueOr(input.c2cChatOrderCreatedMessage, null),
          c2cChatOrderPaidEnabled: this.valueOr(input.c2cChatOrderPaidEnabled, false),
          c2cChatOrderPaidMessage: this.valueOr(input.c2cChatOrderPaidMessage, null),
          c2cChatOrderCompletedEnabled: this.valueOr(input.c2cChatOrderCompletedEnabled, false),
          c2cChatOrderCompletedMessage: this.valueOr(input.c2cChatOrderCompletedMessage, null),
          autoAppealEnabled: this.valueOr(input.autoAppealEnabled, false),
          autoAppealDelayMinutes: this.valueOr(input.autoAppealDelayMinutes, 18),
          description: this.valueOr(input.description, null),
          status: BusinessStatus.ACTIVE,
        }),
      )
      const credentials = manager.getRepository(MerchantPlatformCredentialEntity)
      await credentials.save(
        credentials.create({
          tenantId,
          merchantId: merchant.id,
          platform: input.platform,
          version: 1,
          credentialRef: this.encryptedReference(input.platform, input),
          authMode,
          apiBaseUrl,
          clientType:
            input.platform === MerchantPlatform.BINANCE ? (input.clientType ?? 'WEB') : null,
          xUserId: input.platform === MerchantPlatform.BINANCE ? (input.xUserId ?? null) : null,
          requestTimeoutMs,
          status: BusinessStatus.ACTIVE,
        }),
      )
      return { ...merchant, authMode, credentialConfigured: true }
    })
  }

  async update(tenantId: string, id: string, input: UpdateMerchantInput) {
    if ('platform' in input || 'code' in input) {
      throw new BadRequestException('商家账号编码和平台创建后不可修改')
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MerchantEntity)
      const merchant = await repository.findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!merchant) throw new NotFoundException('商家账号不存在')
      const editable: Array<keyof UpdateMerchantInput> = [
        'name',
        'externalMerchantId',
        'pageSize',
        'overlapSeconds',
        'orderStatusList',
        'paidConfirmIntervalMinMs',
        'paidConfirmIntervalMaxMs',
        'botCode',
        'chatId',
        'c2cChatOrderCreatedEnabled',
        'c2cChatOrderCreatedMessage',
        'c2cChatOrderPaidEnabled',
        'c2cChatOrderPaidMessage',
        'c2cChatOrderCompletedEnabled',
        'c2cChatOrderCompletedMessage',
        'autoAppealEnabled',
        'autoAppealDelayMinutes',
        'description',
      ]
      for (const key of editable) {
        if (input[key] !== undefined)
          (merchant as unknown as Record<string, unknown>)[key] = input[key]
      }
      if (input.apiBaseUrl !== undefined)
        merchant.apiBaseUrl = this.normalizeBaseUrl(input.apiBaseUrl)
      if (input.requestTimeoutMs !== undefined) merchant.requestTimeoutMs = input.requestTimeoutMs
      this.validatePaidInterval(
        merchant.paidConfirmIntervalMinMs,
        merchant.paidConfirmIntervalMaxMs,
      )
      await repository.save(merchant)
      if (input.apiBaseUrl !== undefined || input.requestTimeoutMs !== undefined) {
        await manager
          .getRepository(MerchantPlatformCredentialEntity)
          .update(
            { tenantId, merchantId: id, status: BusinessStatus.ACTIVE },
            { apiBaseUrl: merchant.apiBaseUrl, requestTimeoutMs: merchant.requestTimeoutMs },
          )
      }
      return merchant
    })
  }

  async setStatus(tenantId: string, id: string, status: BusinessStatus) {
    const merchant = await this.repository.findOne({ where: { id, tenantId } })
    if (!merchant) throw new NotFoundException('商家账号不存在')
    merchant.status = status
    return this.repository.save(merchant)
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const merchant = await manager.getRepository(MerchantEntity).findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!merchant) throw new NotFoundException('商家账号不存在')
      if (
        await manager
          .getRepository(MerchantOrderEntity)
          .exists({ where: { tenantId, merchantId: id } })
      ) {
        throw new ConflictException('商家账号已有同步订单，不能删除，可停用该账号')
      }
      await manager
        .getRepository(MerchantPlatformCredentialEntity)
        .delete({ tenantId, merchantId: id })
      await manager.getRepository(MerchantEntity).delete({ id, tenantId })
    })
  }

  private validateAccount(
    platform: MerchantPlatform,
    authMode: 'API_KEY' | 'WEB_COOKIE',
    input: Pick<
      CreateMerchantInput,
      'apiKey' | 'authorization' | 'clientType' | 'secretKey' | 'sessionCookie'
    >,
  ): void {
    if (platform === MerchantPlatform.BINANCE) {
      if (authMode !== 'API_KEY' || !input.apiKey?.trim() || !input.secretKey?.trim()) {
        throw new BadRequestException('币安商家账号必须配置 API Key 和 Secret Key')
      }
      return
    }
    if (authMode !== 'WEB_COOKIE' || !input.sessionCookie?.trim() || !input.authorization?.trim()) {
      throw new BadRequestException('欧易商家账号必须配置 Cookie 和 Authorization')
    }
  }

  private encryptedReference(platform: MerchantPlatform, input: CreateMerchantInput): string {
    const secret =
      platform === MerchantPlatform.BINANCE
        ? { apiKey: input.apiKey!.trim(), secretKey: input.secretKey!.trim() }
        : { cookie: input.sessionCookie!.trim(), authorization: input.authorization!.trim() }
    return `enc://${this.cipher.encrypt(JSON.stringify(secret))}`
  }

  private defaultBaseUrl(platform: MerchantPlatform): string {
    return platform === MerchantPlatform.BINANCE ? 'https://api.binance.com' : 'https://www.okx.com'
  }

  private defaultAuthMode(platform: MerchantPlatform): 'API_KEY' | 'WEB_COOKIE' {
    return platform === MerchantPlatform.BINANCE ? 'API_KEY' : 'WEB_COOKIE'
  }

  private normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/$/, '')
  }

  private validatePaidInterval(minimum: number, maximum: number): void {
    if (minimum > maximum) throw new BadRequestException('付款确认最小间隔不能大于最大间隔')
  }

  private valueOr<T, F>(value: T | undefined, fallback: F): T | F {
    return value === undefined ? fallback : value
  }
}
