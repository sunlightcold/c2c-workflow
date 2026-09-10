import {
  BusinessStatus,
  MerchantEntity,
  MerchantPlatform,
  MerchantPlatformCredentialEntity,
} from '@admin/database'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

export interface RotateMerchantPlatformCredentialInput {
  credentialRef: string
  clientType?: string
  xUserId?: string
  requestTimeoutMs: number
}

export interface MerchantPlatformCredentialView {
  id: string
  merchantId: string
  platform: MerchantPlatform
  version: number
  status: BusinessStatus
  clientType: string | null
  xUserId: string | null
  requestTimeoutMs: number
  credentialConfigured: true
}

@Injectable()
export class MerchantPlatformCredentialService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchantRepository: Repository<MerchantEntity>,
    @InjectRepository(MerchantPlatformCredentialEntity)
    private readonly credentialRepository: Repository<MerchantPlatformCredentialEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, merchantId: string): Promise<MerchantPlatformCredentialView[]> {
    await this.requireMerchant(tenantId, merchantId)
    const credentials = await this.credentialRepository.find({
      where: { tenantId, merchantId },
      order: { version: 'DESC' },
    })
    return credentials.map((credential) => this.toView(credential))
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
          credentialRef: input.credentialRef,
          clientType: input.clientType ?? null,
          xUserId: input.xUserId ?? null,
          requestTimeoutMs: input.requestTimeoutMs,
          status: BusinessStatus.ACTIVE,
        }),
      )
      return this.toView(credential)
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
    if (platform === MerchantPlatform.BINANCE && !input.clientType) {
      throw new BadRequestException('币安商家平台凭据必须配置 clientType')
    }
    if (platform === MerchantPlatform.OKX && (input.clientType || input.xUserId)) {
      throw new BadRequestException('欧易商家平台凭据不接受币安专属字段')
    }
  }

  private toView(credential: MerchantPlatformCredentialEntity): MerchantPlatformCredentialView {
    return {
      id: credential.id,
      merchantId: credential.merchantId,
      platform: credential.platform,
      version: credential.version,
      status: credential.status,
      clientType: credential.clientType,
      xUserId: credential.xUserId,
      requestTimeoutMs: credential.requestTimeoutMs,
      credentialConfigured: true,
    }
  }
}
