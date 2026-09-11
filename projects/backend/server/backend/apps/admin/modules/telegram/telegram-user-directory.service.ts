import { SysUserEntity } from '@admin/database'
import { ActorType, StatusEnum } from '@/common/interfaces'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

export interface TelegramEligibleUser {
  id: number
  nickname: string
  username: string
}

@Injectable()
export class TelegramUserDirectoryService {
  constructor(
    @InjectRepository(SysUserEntity)
    private readonly users: Repository<SysUserEntity>,
  ) {}

  listEligible(tenantId: string): Promise<TelegramEligibleUser[]> {
    return this.users.find({
      select: { id: true, nickname: true, username: true },
      where: [
        {
          actorType: ActorType.PLATFORM,
          status: StatusEnum.ENABLED,
          tenantId: IsNull(),
        },
        {
          actorType: ActorType.TENANT,
          status: StatusEnum.ENABLED,
          tenantId,
        },
      ],
      order: { nickname: 'ASC', username: 'ASC' },
    })
  }
}
