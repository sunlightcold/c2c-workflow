import { MerchantEntity, MerchantOrderEntity } from '@admin/database'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import { C2cPlatformClient, C2cPlatformCredentialFactory } from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'

@Injectable()
export class C2cOrderUpstreamService {
  constructor(
    @InjectRepository(MerchantOrderEntity)
    private readonly orders: Repository<MerchantOrderEntity>,
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
  ) {}

  async query(tenantId: string, merchantId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId, tenantId, merchantId } })
    if (!order) throw new NotFoundException('商家订单不存在')
    const merchant = await this.merchants.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
    if (merchant.platform !== order.platform) throw new BadRequestException('商家平台配置不一致')
    const reference = await this.credentialService.getActiveReference(tenantId, merchantId)
    const secret = await this.secretResolver.resolve(reference.credentialRef)
    const credentials = this.credentialFactory.create(merchant.platform, reference, secret)
    const snapshot = await this.platformClient.getOrderDetailSnapshot(
      merchant.platform,
      credentials,
      order.platformOrderId,
    )
    return {
      platform: order.platform,
      platformOrderId: order.platformOrderId,
      queriedAt: new Date().toISOString(),
      raw: removeCredentials(snapshot.raw),
      normalized: snapshot.normalized,
      normalizationError: snapshot.normalizationError,
    }
  }
}

// Preserve all business fields, but never return authentication material from upstream.
function removeCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeCredentials)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(authorization|cookie|token|accessToken|refreshToken|apiKey|secretKey|signature|privateKey)$/i.test(
          key,
        )
          ? '<REDACTED>'
          : removeCredentials(item),
      ]),
    )
  }
  return value
}
