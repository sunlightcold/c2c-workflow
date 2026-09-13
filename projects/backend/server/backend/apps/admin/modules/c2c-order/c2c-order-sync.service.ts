import { BusinessStatus, MerchantEntity, MerchantPlatform } from '@admin/database'
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import {
  BinanceC2cClient,
  type BinanceCredentials,
  C2cPlatformCredentialFactory,
  type C2cBuyOrderDetail,
  type C2cBuyOrderPage,
  OkxWebPrivateClient,
  type OkxWebPrivateCredentials,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'
import type { C2cOrderSyncStore } from './c2c-order-sync.types'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'

export const C2C_ORDER_SYNC_STORE = Symbol('C2C_ORDER_SYNC_STORE')
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000

@Injectable()
export class C2cOrderSyncService {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchantRepository: Repository<MerchantEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly binance: BinanceC2cClient,
    private readonly okx: OkxWebPrivateClient,
    @Inject(C2C_ORDER_SYNC_STORE) private readonly store: C2cOrderSyncStore,
    @Optional() private readonly eventEmitter?: EventEmitterService,
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
        ? lastSuccessAt.getTime() - (merchant.overlapSeconds ?? 120) * 1000
        : now.getTime() - INITIAL_LOOKBACK_MS
      const orders = await this.fetchAll(
        merchant.platform,
        this.credentialFactory.create(merchant.platform, reference, secret),
        startDate,
        now.getTime(),
        merchant.pageSize ?? 20,
        merchant.orderStatusList ?? [1],
      )
      const result = await this.store.persistWindow(
        { tenantId, merchantId, platform: merchant.platform },
        orders,
        now,
      )
      const orderIds = [
        ...new Set([...(result.createdOrderIds ?? []), ...(result.changedOrderIds ?? [])]),
      ]
      if (orderIds.length) {
        this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_ORDER_DISCOVERED, {
          tenantId,
          merchantId,
          orderIds,
        })
      }
      return { scanned: orders.length, created: result.created, updated: result.updated }
    } catch (error) {
      await this.store.recordFailure(tenantId, merchantId, now, this.errorMessage(error))
      this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_EXCEPTION, {
        tenantId,
        merchantId,
        code: 'C2C_ORDER_SYNC_FAILED',
        message: this.errorMessage(error),
      })
      throw error
    }
  }

  private async fetchAll(
    platform: MerchantPlatform,
    credentials: BinanceCredentials | OkxWebPrivateCredentials,
    startDate: number,
    endDate: number,
    pageSize: number,
    orderStatusList: number[],
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
        rows: pageSize,
        orderStatusList,
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

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
