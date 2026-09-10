import { BusinessStatus, MerchantEntity, MerchantPlatform } from '@admin/database'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import {
  BinanceC2cClient,
  type BinanceCredentials,
  type C2cBuyOrderDetail,
  type C2cBuyOrderPage,
  OkxWebPrivateClient,
  type OkxWebPrivateCredentials,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'
import type { C2cOrderSyncStore } from './c2c-order-sync.types'

export const C2C_ORDER_SYNC_STORE = Symbol('C2C_ORDER_SYNC_STORE')
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000
const OVERLAP_MS = 2 * 60 * 1000
const PAGE_SIZE = 50

@Injectable()
export class C2cOrderSyncService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchantRepository: Repository<MerchantEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly binance: BinanceC2cClient,
    private readonly okx: OkxWebPrivateClient,
    @Inject(C2C_ORDER_SYNC_STORE) private readonly store: C2cOrderSyncStore,
  ) {}

  async sync(tenantId: string, merchantId: string, now = new Date()) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
    if (merchant.status !== BusinessStatus.ACTIVE) throw new BadRequestException('商家已停用')
    try {
      const reference = await this.credentialService.getActiveReference(tenantId, merchantId)
      const secret = await this.secretResolver.resolve(reference.credentialRef)
      const lastSuccessAt = await this.store.getLastSuccessAt(tenantId, merchantId)
      const startDate = lastSuccessAt
        ? lastSuccessAt.getTime() - OVERLAP_MS
        : now.getTime() - INITIAL_LOOKBACK_MS
      const orders = await this.fetchAll(
        merchant.platform,
        this.credentials(merchant.platform, reference, secret),
        startDate,
        now.getTime(),
      )
      const result = await this.store.persistWindow(
        { tenantId, merchantId, platform: merchant.platform },
        orders,
        now,
      )
      return { scanned: orders.length, ...result }
    } catch (error) {
      await this.store.recordFailure(tenantId, merchantId, now, this.errorMessage(error))
      throw error
    }
  }

  private async fetchAll(
    platform: MerchantPlatform,
    credentials: BinanceCredentials | OkxWebPrivateCredentials,
    startDate: number,
    endDate: number,
  ): Promise<C2cBuyOrderDetail[]> {
    const result: C2cBuyOrderDetail[] = []
    let page = 1
    let response: C2cBuyOrderPage
    do {
      response = await this.list(platform, credentials, {
        tradeType: 'BUY',
        asset: 'USDT',
        startDate,
        endDate,
        page,
        rows: PAGE_SIZE,
        orderStatusList: [1, 2, 3, 4, 6, 7],
      })
      for (const summary of response.items) {
        const detail = await this.detail(platform, credentials, summary.platformOrderId)
        result.push({ ...detail, assetAmount: detail.assetAmount ?? summary.assetAmount })
      }
      page += 1
    } while (result.length < response.total && response.items.length > 0)
    return result
  }

  private list(
    platform: MerchantPlatform,
    credentials: BinanceCredentials | OkxWebPrivateCredentials,
    input: Parameters<BinanceC2cClient['listOrders']>[1],
  ) {
    return platform === MerchantPlatform.BINANCE
      ? this.binance.listOrders(credentials as BinanceCredentials, input)
      : this.okx.listOrders(credentials as OkxWebPrivateCredentials, input)
  }

  private detail(
    platform: MerchantPlatform,
    credentials: BinanceCredentials | OkxWebPrivateCredentials,
    orderId: string,
  ) {
    return platform === MerchantPlatform.BINANCE
      ? this.binance.getOrderDetail(credentials as BinanceCredentials, orderId)
      : this.okx.getOrderDetail(credentials as OkxWebPrivateCredentials, orderId)
  }

  private credentials(
    platform: MerchantPlatform,
    reference: {
      clientType: string | null
      xUserId: string | null
      requestTimeoutMs: number
    },
    secret: Record<string, unknown>,
  ): BinanceCredentials | OkxWebPrivateCredentials {
    if (platform === MerchantPlatform.BINANCE) {
      const apiKey = this.text(secret.apiKey)
      const secretKey = this.text(secret.secretKey)
      if (!apiKey || !secretKey || !reference.clientType) {
        throw new Error('币安 Secret 缺少 apiKey、secretKey 或 clientType')
      }
      return {
        apiKey,
        secretKey,
        clientType: reference.clientType,
        timeoutMs: reference.requestTimeoutMs,
        ...(reference.xUserId ? { xUserId: reference.xUserId } : {}),
      }
    }
    const cookie = this.text(secret.cookie)
    const authorization = this.text(secret.authorization)
    if (!cookie || !authorization) throw new Error('欧易 Secret 缺少 cookie 或 authorization')
    return { cookie, authorization, timeoutMs: reference.requestTimeoutMs }
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
