import {
  MerchantEntity,
  SysUserEntity,
  TelegramBotEntity,
  TelegramGroupEntity,
  TelegramGroupMemberEntity,
  TelegramSuperAdminEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { TelegramBotService } from './telegram-bot.service'
import { TelegramController } from './telegram.controller'
import { TelegramGroupService } from './telegram-group.service'
import { TelegramMemberService } from './telegram-member.service'
import { TelegramSuperAdminService } from './telegram-super-admin.service'

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
    ]),
  ],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    TelegramGroupService,
    TelegramMemberService,
    TelegramSuperAdminService,
  ],
  exports: [
    TelegramBotService,
    TelegramGroupService,
    TelegramMemberService,
    TelegramSuperAdminService,
  ],
})
export class TelegramModule {}
