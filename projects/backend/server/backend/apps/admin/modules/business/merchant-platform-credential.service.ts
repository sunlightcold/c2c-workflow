import {
  BusinessStatus,
  MerchantEntity,
  MerchantPlatform,
  MerchantPlatformCredentialEntity,
} from '@admin/database'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'
import { C2cPlatformClient, C2cPlatformCredentialFactory } from '../c2c-platform'

export interface RotateMerchantPlatformCredentialInput {
  apiKey?: string
  secretKey?: string
  sessionCookie?: string
  authorization?: string
  signaturePrivateKey?: string
  skipPaymentProofUpload?: boolean
  clientType?: string
  xUserId?: string
  requestTimeoutMs: number
}

export interface MerchantPlatformCredentialView {
  id: string
  merchantId: string
  platform: MerchantPlatform
  authMode: 'API_KEY' | 'WEB_COOKIE'
  version: number
  status: BusinessStatus
  clientType: string | null
  xUserId: string | null
  requestTimeoutMs: number
  credentialConfigured: true
}

export interface ActiveMerchantPlatformCredentialReference {
  credentialRef: string
  apiBaseUrl: string
  clientType: string | null
  xUserId: string | null
  requestTimeoutMs: number
}

@Injectable()
export class MerchantPlatformCredentialService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchantRepository: Repository<MerchantEntity>,
    @InjectRepository(MerchantPlatformCredentialEntity)
    private readonly credentialRepository: Repository<MerchantPlatformCredentialEntity>,
    private readonly dataSource: DataSource,
    private readonly cipher: CredentialCipherService,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
  ) {}

  async list(tenantId: string, merchantId: string): Promise<MerchantPlatformCredentialView[]> {
    await this.requireMerchant(tenantId, merchantId)
    const credentials = await this.credentialRepository.find({
      where: { tenantId, merchantId },
      order: { version: 'DESC' },
    })
    return credentials.map((credential) => this.toView(credential))
  }

  async remove(tenantId: string, merchantId: string, credentialId: string): Promise<void> {
    await this.requireMerchant(tenantId, merchantId)
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId, merchantId },
    })
    if (!credential) throw new NotFoundException('平台凭据不存在')
    if (credential.status === BusinessStatus.ACTIVE) {
      throw new BadRequestException('当前生效凭据不能删除，请先更新凭据或停用商家账号')
    }
    await this.credentialRepository.remove(credential)
  }

  rotate(
    tenantId: string,
    merchantId: string,
    input: RotateMerchantPlatformCredentialInput,
  ): Promise<MerchantPlatformCredentialView> {
    return this.dataSource.transaction(async (manager) => {
      const merchant = await manager.getRepository(MerchantEntity).findOne({
        where: { id: merchantId, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!merchant) throw new NotFoundException('商家不存在')
      this.validatePlatformFields(merchant.platform, input)

      const repository = manager.getRepository(MerchantPlatformCredentialEntity)
      const latest = await repository.findOne({
        where: { tenantId, merchantId },
        order: { version: 'DESC' },
      })
      await repository.update(
        { tenantId, merchantId, status: BusinessStatus.ACTIVE },
        { status: BusinessStatus.DISABLED },
      )
      const credential = await repository.save(
        repository.create({
          tenantId,
          merchantId,
          platform: merchant.platform,
          version: (latest?.version ?? 0) + 1,
          credentialRef: this.encryptedReference(merchant.platform, input),
          authMode: merchant.platform === MerchantPlatform.BINANCE ? 'API_KEY' : 'WEB_COOKIE',
          apiBaseUrl: merchant.apiBaseUrl,
          clientType:
            merchant.platform === MerchantPlatform.BINANCE ? (input.clientType ?? 'WEB') : null,
          xUserId: merchant.platform === MerchantPlatform.BINANCE ? (input.xUserId ?? null) : null,
          requestTimeoutMs: input.requestTimeoutMs ?? merchant.requestTimeoutMs,
          status: BusinessStatus.ACTIVE,
        }),
      )
      return this.toView(credential)
    })
  }

  async getActiveReference(
    tenantId: string,
    merchantId: string,
  ): Promise<ActiveMerchantPlatformCredentialReference> {
    const credential = await this.credentialRepository
      .createQueryBuilder('credential')
      .addSelect('credential.credentialRef')
      .where('credential.tenantId = :tenantId', { tenantId })
      .andWhere('credential.merchantId = :merchantId', { merchantId })
      .andWhere('credential.status = :status', { status: BusinessStatus.ACTIVE })
      .getOne()
    if (!credential) throw new BadRequestException('商家未配置生效的平台凭据')
    return {
      credentialRef: credential.credentialRef,
      apiBaseUrl: credential.apiBaseUrl,
      clientType: credential.clientType,
      xUserId: credential.xUserId,
      requestTimeoutMs: credential.requestTimeoutMs,
    }
  }

  async testConnection(tenantId: string, merchantId: string) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new NotFoundException('商家账号不存在')
    const reference = await this.getActiveReference(tenantId, merchantId)
    if (!reference.credentialRef.startsWith('enc://')) {
      throw new BadRequestException('商家账号凭据不是后台可维护的加密凭据')
    }
    const raw = this.cipher.decrypt(reference.credentialRef.slice('enc://'.length))
    const secret = JSON.parse(raw) as Record<string, unknown>
    const credentials = this.credentialFactory.create(merchant.platform, reference, secret)
    const now = Date.now()
    const input = {
      tradeType: 'BUY' as const,
      asset: 'USDT',
      startDate: now - 60_000,
      endDate: now,
      page: 1,
      rows: 1,
      orderStatusList: merchant.orderStatusList,
    }
    await this.platformClient.listOrders(merchant.platform, credentials, input)
    return { success: true, platform: merchant.platform }
  }

  async disableRejectedCredential(tenantId: string, merchantId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const merchantRepository = manager.getRepository(MerchantEntity)
      const credentialRepository = manager.getRepository(MerchantPlatformCredentialEntity)
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!merchant || merchant.status !== BusinessStatus.ACTIVE) return false
      merchant.status = BusinessStatus.DISABLED
      await merchantRepository.save(merchant)
      await credentialRepository.update(
        { tenantId, merchantId, status: BusinessStatus.ACTIVE },
        { status: BusinessStatus.DISABLED },
      )
      return true
    })
  }

  private async requireMerchant(tenantId: string, merchantId: string): Promise<void> {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
  }

  private validatePlatformFields(
    platform: MerchantPlatform,
    input: RotateMerchantPlatformCredentialInput,
  ): void {
    if (
      platform === MerchantPlatform.BINANCE &&
      (!input.apiKey?.trim() || !input.secretKey?.trim())
    ) {
      throw new BadRequestException('币安商家账号必须配置 API Key 和 Secret Key')
    }
    if (
      platform === MerchantPlatform.OKX &&
      (!input.sessionCookie?.trim() ||
        !input.authorization?.trim() ||
        !input.signaturePrivateKey?.trim())
    ) {
      throw new BadRequestException('欧易商家账号必须配置 Cookie、Authorization 和签名私钥')
    }
  }

  private encryptedReference(
    platform: MerchantPlatform,
    input: RotateMerchantPlatformCredentialInput,
  ): string {
    const secret =
      platform === MerchantPlatform.BINANCE
        ? { apiKey: input.apiKey!.trim(), secretKey: input.secretKey!.trim() }
        : {
            cookie: input.sessionCookie!.trim(),
            authorization: input.authorization!.trim(),
            signaturePrivateKey: input.signaturePrivateKey!.trim(),
            skipPaymentProofUpload: input.skipPaymentProofUpload ?? true,
          }
    return `enc://${this.cipher.encrypt(JSON.stringify(secret))}`
  }

  private toView(credential: MerchantPlatformCredentialEntity): MerchantPlatformCredentialView {
    return {
      id: credential.id,
      merchantId: credential.merchantId,
      platform: credential.platform,
      authMode: credential.authMode,
      version: credential.version,
      status: credential.status,
      clientType: credential.clientType,
      xUserId: credential.xUserId,
      requestTimeoutMs: credential.requestTimeoutMs,
      credentialConfigured: true,
    }
  }
}
