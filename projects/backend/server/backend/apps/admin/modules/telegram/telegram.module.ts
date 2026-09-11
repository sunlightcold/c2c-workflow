import {
  MerchantEntity,
  SysUserEntity,
  TelegramBotEntity,
  TelegramGroupEntity,
  TelegramGroupMemberEntity,
  TelegramSuperAdminEntity,
  TelegramUpdateEventEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { TelegramBotService } from './telegram-bot.service'
import { TelegramApiClient } from './telegram-api.client'
import { TelegramAuthorizationService } from './telegram-authorization.service'
import { TelegramController } from './telegram.controller'
import { TelegramGroupService } from './telegram-group.service'
import { TelegramMemberService } from './telegram-member.service'
import { TelegramSuperAdminService } from './telegram-super-admin.service'
import { TelegramUpdateInboxService } from './telegram-update-inbox.service'
import { TelegramUpdateProcessorService } from './telegram-update-processor.service'
import { TelegramUserDirectoryService } from './telegram-user-directory.service'
import { TelegramWebhookController } from './telegram-webhook.controller'
import { TelegramRuntimeService } from './telegram-runtime.service'

@Module({
  imports: [
    BusinessModule,
    TypeOrmModule.forFeature([
      MerchantEntity,
      SysUserEntity,
      TelegramBotEntity,
      TelegramGroupEntity,
      TelegramGroupMemberEntity,
      TelegramSuperAdminEntity,
      TelegramUpdateEventEntity,
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
    TelegramUserDirectoryService,
    TelegramRuntimeService,
  ],
  exports: [
    TelegramBotService,
    TelegramGroupService,
    TelegramMemberService,
    TelegramSuperAdminService,
  ],
})
export class TelegramModule {}
