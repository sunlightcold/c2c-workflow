import { SysAccessTokenEntity, SysOnlineUserEntity, SysTaskSource } from '@/apps/admin/database'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThanOrEqual, Repository } from 'typeorm'
import { ScheduleTask } from '../task.decorator'
import { CLIENT_ERROR_RETENTION_DAYS, ClientErrorService } from '../../../client-error'

@ScheduleTask()
@Injectable()
export class SystemMaintenanceJob {
  private readonly logger = new Logger(SystemMaintenanceJob.name)

  constructor(
    @InjectRepository(SysAccessTokenEntity)
    private readonly accessTokenRepository: Repository<SysAccessTokenEntity>,
    @InjectRepository(SysOnlineUserEntity)
    private readonly onlineUserRepository: Repository<SysOnlineUserEntity>,
    private readonly clientErrorService: ClientErrorService,
  ) {}

  async clearExpiredAdminTokenSessions() {
    const now = new Date()
    const expiredTokens = await this.accessTokenRepository.find({
      select: ['id'],
      where: { expiredAt: LessThanOrEqual(now) },
    })
    const tokenIds = expiredTokens.map((item) => item.id)
    if (tokenIds.length === 0) {
      return {
        deletedAccessTokens: 0,
        deletedOnlineUsers: 0,
        taskSource: SysTaskSource.System,
      }
    }

    const onlineResult = await this.onlineUserRepository
      .createQueryBuilder()
      .delete()
      .where('tokenId IN (:...tokenIds)', { tokenIds })
      .execute()
    const tokenResult = await this.accessTokenRepository.delete({
      id: In(tokenIds),
    })

    this.logger.log(`清理过期后台Token会话 ${tokenResult.affected ?? 0} 条`)

    return {
      deletedAccessTokens: tokenResult.affected ?? 0,
      deletedOnlineUsers: onlineResult.affected ?? 0,
      taskSource: SysTaskSource.System,
    }
  }

  async clearExpiredClientErrors() {
    const cutoff = new Date(Date.now() - CLIENT_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const deletedClientErrors = await this.clientErrorService.deleteCreatedBefore(cutoff)
    this.logger.log(`清理过期客户端错误 ${deletedClientErrors} 条`)
    return { deletedClientErrors, taskSource: SysTaskSource.System }
  }
}
