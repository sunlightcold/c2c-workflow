import { ActorType, StatusEnum } from '@/common/interfaces'
import {
  BusinessStatus,
  MerchantEntity,
  SysUserEntity,
  TelegramBotEntity,
  TelegramGroupBindingState,
  TelegramGroupEntity,
  TelegramGroupMemberEntity,
  TelegramSuperAdminEntity,
  TelegramSuperAdminScopeType,
} from '@admin/database'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import type { TelegramCapability } from './telegram-policy'

export type TelegramAuthorizationFailure =
  | 'CHAT_NOT_BOUND'
  | 'MERCHANT_DISABLED'
  | 'USER_NOT_AUTHORIZED'

export type TelegramAuthorizationResult =
  | { allowed: false; reason: TelegramAuthorizationFailure }
  | {
      allowed: true
      capabilities: TelegramCapability[]
      group: TelegramGroupEntity
      user: SysUserEntity
    }

type RuntimeBot = Pick<TelegramBotEntity, 'capabilities' | 'id' | 'tenantId'>

@Injectable()
export class TelegramAuthorizationService {
  constructor(
    @InjectRepository(TelegramGroupEntity)
    private readonly groups: Repository<TelegramGroupEntity>,
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    @InjectRepository(TelegramGroupMemberEntity)
    private readonly members: Repository<TelegramGroupMemberEntity>,
    @InjectRepository(TelegramSuperAdminEntity)
    private readonly superAdmins: Repository<TelegramSuperAdminEntity>,
    @InjectRepository(SysUserEntity)
    private readonly users: Repository<SysUserEntity>,
  ) {}

  async isActiveSuperAdmin(tenantId: string, telegramUserId: string): Promise<boolean> {
    const admin = await this.superAdmins.findOne({
      where: { tenantId, telegramUserId, status: BusinessStatus.ACTIVE },
    })
    return Boolean(admin)
  }

  async authorize(
    bot: RuntimeBot,
    chatId: string,
    telegramUserId: string,
  ): Promise<TelegramAuthorizationResult> {
    const group = await this.groups.findOne({
      where: {
        tenantId: bot.tenantId,
        botId: bot.id,
        chatId,
        bindingState: TelegramGroupBindingState.ACTIVE,
      },
    })
    if (!group) return { allowed: false, reason: 'CHAT_NOT_BOUND' }

    const merchant = await this.merchants.findOne({
      where: {
        id: group.merchantId,
        tenantId: bot.tenantId,
        status: BusinessStatus.ACTIVE,
      },
    })
    if (!merchant) return { allowed: false, reason: 'MERCHANT_DISABLED' }

    const superAdmin = await this.superAdmins.findOne({
      where: {
        tenantId: bot.tenantId,
        telegramUserId,
        status: BusinessStatus.ACTIVE,
      },
    })
    if (
      superAdmin &&
      (superAdmin.scopeType === TelegramSuperAdminScopeType.ALL_GROUPS ||
        superAdmin.groupIds.includes(group.id))
    ) {
      const user = await this.findActiveUser(bot.tenantId, superAdmin.userId)
      if (user) {
        return {
          allowed: true,
          capabilities: this.intersectCapabilities(bot.capabilities, group.capabilities),
          group,
          user,
        }
      }
    }

    const member = await this.members.findOne({
      where: {
        tenantId: bot.tenantId,
        groupId: group.id,
        telegramUserId,
        status: BusinessStatus.ACTIVE,
      },
    })
    if (!member) return { allowed: false, reason: 'USER_NOT_AUTHORIZED' }
    const user = await this.findActiveUser(bot.tenantId, member.userId)
    if (!user) return { allowed: false, reason: 'USER_NOT_AUTHORIZED' }
    return {
      allowed: true,
      capabilities: this.intersectCapabilities(
        bot.capabilities,
        group.capabilities,
        member.capabilities,
      ),
      group,
      user,
    }
  }

  private findActiveUser(tenantId: string, userId: number) {
    return this.users.findOne({
      where: [
        {
          id: userId,
          actorType: ActorType.PLATFORM,
          tenantId: IsNull(),
          status: StatusEnum.ENABLED,
        },
        {
          id: userId,
          actorType: ActorType.TENANT,
          tenantId,
          status: StatusEnum.ENABLED,
        },
      ],
    })
  }

  private intersectCapabilities(...sets: string[][]): TelegramCapability[] {
    const [first = [], ...rest] = sets
    return first.filter((capability) =>
      rest.every((set) => set.includes(capability)),
    ) as TelegramCapability[]
  }
}
