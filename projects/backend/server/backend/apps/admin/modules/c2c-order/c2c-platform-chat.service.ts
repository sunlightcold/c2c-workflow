import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatus,
} from '@admin/database'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE,
  DEFAULT_ORDER_CREATED_CHAT_MESSAGE,
  DEFAULT_ORDER_PAID_CHAT_MESSAGE,
} from '../business/merchant-chat-message.constants'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import { C2cPlatformClient, C2cPlatformCredentialFactory } from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'

type ChatStage = 'CREATED' | 'PAID' | 'COMPLETED'

@Injectable()
export class C2cPlatformChatService {
  private readonly logger = new Logger(C2cPlatformChatService.name)

  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    @InjectRepository(MerchantOrderEntity)
    private readonly orders: Repository<MerchantOrderEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
  ) {}

  sendOrderCreated(tenantId: string, merchantId: string, merchantOrderId: string): Promise<void> {
    return this.send(tenantId, merchantId, merchantOrderId, 'CREATED')
  }

  sendOrderPaid(tenantId: string, merchantId: string, merchantOrderId: string): Promise<void> {
    return this.send(tenantId, merchantId, merchantOrderId, 'PAID')
  }

  sendOrderCompleted(tenantId: string, merchantId: string, merchantOrderId: string): Promise<void> {
    return this.send(tenantId, merchantId, merchantOrderId, 'COMPLETED')
  }

  async sendCompletedOrders(
    tenantId: string,
    merchantId: string,
    merchantOrderIds: string[],
  ): Promise<void> {
    await Promise.all(
      merchantOrderIds.map((merchantOrderId) =>
        this.sendOrderCompleted(tenantId, merchantId, merchantOrderId),
      ),
    )
  }

  private async send(
    tenantId: string,
    merchantId: string,
    merchantOrderId: string,
    stage: ChatStage,
  ): Promise<void> {
    try {
      const [merchant, order] = await Promise.all([
        this.merchants.findOne({ where: { id: merchantId, tenantId } }),
        this.orders.findOne({ where: { id: merchantOrderId, tenantId, merchantId } }),
      ])
      if (!merchant || !order || merchant.status !== BusinessStatus.ACTIVE) return
      if (stage === 'COMPLETED' && order.status !== MerchantOrderStatus.COMPLETED) return
      const setting = this.setting(merchant, stage)
      if (!setting.enabled || !this.platformClient.getCapabilities(merchant.platform).chat) return
      const reference = await this.credentialService.getActiveReference(tenantId, merchantId)
      const secret = await this.secretResolver.resolve(reference.credentialRef)
      const credentials = this.credentialFactory.create(merchant.platform, reference, secret)
      await this.platformClient.sendChatText(
        merchant.platform,
        credentials,
        order.platformOrderId,
        setting.message,
      )
    } catch (error) {
      this.logger.warn(
        `C2C 平台聊天消息发送失败: order=${merchantOrderId}, stage=${stage}, error=${this.errorMessage(error)}`,
      )
    }
  }

  private setting(merchant: MerchantEntity, stage: ChatStage) {
    if (stage === 'CREATED') {
      return {
        enabled: merchant.c2cChatOrderCreatedEnabled,
        message: merchant.c2cChatOrderCreatedMessage || DEFAULT_ORDER_CREATED_CHAT_MESSAGE,
      }
    }
    if (stage === 'PAID') {
      return {
        enabled: merchant.c2cChatOrderPaidEnabled,
        message: merchant.c2cChatOrderPaidMessage || DEFAULT_ORDER_PAID_CHAT_MESSAGE,
      }
    }
    return {
      enabled: merchant.c2cChatOrderCompletedEnabled,
      message: merchant.c2cChatOrderCompletedMessage || DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE,
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
