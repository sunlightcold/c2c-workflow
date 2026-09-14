import {
  MerchantEntity,
  MerchantOrderEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentOrderEntity,
  TelegramBotEntity,
  TelegramGroupEntity,
  TelegramGroupMemberEntity,
  TelegramSuperAdminEntity,
  TelegramUpdateEventEntity,
  TelegramInteractionContextEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { C2cOrderModule } from '../c2c-order'
import { PaymentModule } from '../payment'
import { CredentialModule } from '../system/credential'
import { TelegramBotService } from './telegram-bot.service'
import { TelegramApiClient } from './telegram-api.client'
import { TelegramAuthorizationService } from './telegram-authorization.service'
import { TelegramController } from './telegram.controller'
import { TelegramGroupService } from './telegram-group.service'
import { TelegramMemberService } from './telegram-member.service'
import { TelegramSuperAdminService } from './telegram-super-admin.service'
import { TelegramUpdateInboxService } from './telegram-update-inbox.service'
import { TelegramUpdateProcessorService } from './telegram-update-processor.service'
import { TelegramWebhookController } from './telegram-webhook.controller'
import { TelegramRuntimeService } from './telegram-runtime.service'
import { TelegramInteractionService } from './telegram-interaction.service'
import { TelegramManualPaymentService } from './telegram-manual-payment.service'
import { TelegramBatchPaymentService } from './telegram-batch-payment.service'
import { TelegramQueryService } from './telegram-query.service'
import { TelegramNotificationService } from './telegram-notification.service'
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service'
import { TelegramC2cOrderActionService } from './telegram-c2c-order-action.service'
import { TelegramC2cAppealService } from './telegram-c2c-appeal.service'

@Module({
  imports: [
    BusinessModule,
    C2cOrderModule,
    PaymentModule,
    CredentialModule,
    TypeOrmModule.forFeature([
      MerchantEntity,
      MerchantOrderEntity,
      PaymentBatchEntity,
      PaymentBatchItemEntity,
      PaymentOrderEntity,
      TelegramBotEntity,
      TelegramGroupEntity,
      TelegramGroupMemberEntity,
      TelegramSuperAdminEntity,
      TelegramUpdateEventEntity,
      TelegramInteractionContextEntity,
    ]),
  ],
  controllers: [TelegramController, TelegramWebhookController],
  providers: [
    TelegramBotService,
    TelegramApiClient,
    TelegramAuthorizationService,
    TelegramGroupService,
    TelegramMemberService,
    TelegramSuperAdminService,
    TelegramUpdateInboxService,
    TelegramUpdateProcessorService,
    TelegramRuntimeService,
    TelegramInteractionService,
    TelegramManualPaymentService,
    TelegramBatchPaymentService,
    TelegramQueryService,
    TelegramNotificationService,
    TelegramBotRuntimeService,
    TelegramC2cOrderActionService,
    TelegramC2cAppealService,
  ],
  exports: [
    TelegramBotService,
    TelegramGroupService,
    TelegramMemberService,
    TelegramSuperAdminService,
    TelegramNotificationService,
    TelegramBotRuntimeService,
  ],
})
export class TelegramModule {}
