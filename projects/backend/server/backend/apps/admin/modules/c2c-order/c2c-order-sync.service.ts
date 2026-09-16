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
  C2cPlatformClient,
  type C2cPlatformCredentials,
  C2cPlatformCredentialFactory,
  type C2cBuyOrderDetail,
  C2cCredentialRejectedError,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'
import type { C2cOrderSyncStore } from './c2c-order-sync.types'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'
import { C2cCompletionReplyService } from './c2c-completion-reply.service'

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
    private readonly platformClient: C2cPlatformClient,
    @Inject(C2C_ORDER_SYNC_STORE) private readonly store: C2cOrderSyncStore,
    @Optional() private readonly eventEmitter?: EventEmitterService,
    @Optional() private readonly completionReplies?: C2cCompletionReplyService,
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
      await this.completionReplies?.sendCompletedOrders(
        tenantId,
        merchantId,
        result.changedOrderIds ?? [],
      )
      // "discovered" is a first-seen event. Status refreshes are persisted for
      // reconciliation but must not spam Telegram on every polling interval.
      const orderIds = [...new Set(result.createdOrderIds ?? [])]
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
      const credentialRejected = error instanceof C2cCredentialRejectedError
      if (credentialRejected) {
        const disabled = await this.credentialService.disableRejectedCredential(
          tenantId,
          merchantId,
        )
        if (disabled) {
          this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_EXCEPTION, {
            tenantId,
            merchantId,
            code: 'C2C_CREDENTIAL_REJECTED',
            message: this.errorMessage(error),
            referenceId: merchant.code,
            platform: merchant.platform,
            merchantNo: merchant.externalMerchantId ?? merchant.code,
          })
        }
      }
      if (!credentialRejected) {
        this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_EXCEPTION, {
          tenantId,
          merchantId,
          code: 'C2C_ORDER_SYNC_FAILED',
          message: this.errorMessage(error),
        })
      }
      throw error
    }
  }

  private async fetchAll(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    startDate: number,
    endDate: number,
    pageSize: number,
    orderStatusList: number[],
  ): Promise<C2cBuyOrderDetail[]> {
    const result: C2cBuyOrderDetail[] = []
    let page = 1
    let response
    do {
      response = await this.platformClient.listOrders(platform, credentials, {
        tradeType: 'BUY',
        asset: 'USDT',
        startDate,
        endDate,
        page,
        rows: pageSize,
        orderStatusList,
      })
      for (const summary of response.items) {
        const detail = await this.platformClient.getOrderDetail(
          platform,
          credentials,
          summary.platformOrderId,
        )
        result.push({ ...detail, assetAmount: detail.assetAmount ?? summary.assetAmount })
      }
      page += 1
    } while (response.hasMore)
    return result
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
