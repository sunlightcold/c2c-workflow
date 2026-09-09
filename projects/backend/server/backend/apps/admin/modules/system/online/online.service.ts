import {
  SysAccessTokenEntity,
  SysOnlineUserEntity,
  SysOnlineUserStatus,
} from '@/apps/admin/database'
import { VerifyAuthUser } from '@/common/interfaces'
import { toPaginationParams } from '@/common/dto'
import { IJwtService } from '@/apps/admin/modules/system/auth/services/jwt.service'
import { CacheService } from '@admin/modules/cache'
import { EVENT_KEYS, EventEmitterService } from '@admin/modules/event-emitter'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { lookup } from 'geoip-lite'
import { paginate } from 'nestjs-typeorm-paginate'
import { Repository } from 'typeorm'
import { UAParser } from 'ua-parser-js'
import { OnlineCreateDto, OnlineFilterDto } from './dto'

@Injectable()
export class OnlineService {
  @InjectRepository(SysOnlineUserEntity)
  private readonly onlineUserRepository: Repository<SysOnlineUserEntity>
  @InjectRepository(SysAccessTokenEntity)
  private readonly accessTokenEntity: Repository<SysAccessTokenEntity>
  @Inject(IJwtService) private readonly jwtService: IJwtService
  @Inject(CacheService) private readonly cacheService: CacheService
  @Inject(EventEmitterService) private readonly eventEmitter: EventEmitterService

  private readonly logger = new Logger(OnlineService.name)

  /**
   * 记录后台登录会话的客户端环境。
   *
   * 这里的状态表示 token 当前是否有活跃 WebSocket 连接。
   * token 被撤销后会删除会话记录，不保留“已撤销”历史行。
   */
  async recordSessionClient(token: string, ua: string, ip: string) {
    const accessToken = await this.jwtService.getAccessToken(token)
    if (!accessToken) return

    const payload = await this.jwtService.verifyAsync(token)
    const agent = UAParser(ua)
    const ipInfo = lookup(ip)

    const os = `${agent.os.name || 'unknown'} ${agent.os.version || 'unknown'}`
    const city = ipInfo?.city || 'unknown'
    const country = ipInfo?.country || 'unknown'
    const region = ipInfo?.region || 'unknown'
    const browser = `${agent.browser.name || 'unknown'} ${agent.browser.version || 'unknown'}`

    const onlineUser = await this.onlineUserRepository.findOneBy({
      accessToken: { id: accessToken.id },
    })
    if (onlineUser) {
      await this.onlineUserRepository.update(onlineUser.id, {
        agent: ua,
        browser,
        city,
        country,
        ip,
        os,
        region,
        status: SysOnlineUserStatus.ONLINE,
      })
    } else {
      await this.onlineUserRepository.save({
        agent: ua,
        browser,
        city,
        country,
        ip,
        loginAt: new Date(),
        os,
        region,
        status: SysOnlineUserStatus.ONLINE,
        user: { id: payload.uid },
        accessToken: { id: accessToken.id },
      })
    }
    this.logger.log(`用户 ${payload.username} 登录`)
  }

  /**
   * 强制下线
   */
  async kick(id: string) {
    const online = await this.onlineUserRepository.findOne({
      where: { id },
      relations: ['accessToken'],
    })
    if (!online?.accessToken?.value) return { revoked: false }
    return await this.revokeSession(online.accessToken.value, online.id)
  }

  /**
   * 下线指定用户的所有token
   */
  async offlineAllDeviceByUserid(id: number) {
    return await this.revokeAllSessionsByUserId(id)
  }

  async revokeAllSessionsByUserId(id: number) {
    const accessTokenList = await this.jwtService.finAllTokenByUserId(id)
    for (const item of accessTokenList) {
      await this.revokeLoginStatus(item.value)
    }
  }

  /**
   * 清除登录状态
   */
  async clearLoginStatus(accessToken: string) {
    return await this.revokeLoginStatus(accessToken)
  }

  async revokeLoginStatus(accessToken: string) {
    return await this.revokeSession(accessToken)
  }

  async revokeSession(accessToken: string, onlineId?: string) {
    const token = onlineId
      ? undefined
      : await this.accessTokenEntity.findOneBy({ value: accessToken })
    const payload = await this.getSessionPayload(accessToken)
    await this.revokeTokenCache(accessToken, payload)

    if (onlineId) {
      await this.onlineUserRepository.delete(onlineId)
    } else if (token) {
      await this.deleteSessionMetadataByTokenId(token.id)
    }

    await this.accessTokenEntity.delete({ value: accessToken })
    this.eventEmitter.emit(EVENT_KEYS.ADMIN_SESSION_REVOKED, {
      token: accessToken,
      userId: payload?.uid,
    })
    return { revoked: true }
  }

  async create(dto: OnlineCreateDto) {
    const { accessTokenId, userId, ...data } = dto
    const result = await this.onlineUserRepository.save({
      ...data,
      accessToken: { id: accessTokenId },
      user: { id: userId },
    })
    return result
  }

  async filter(dto: OnlineFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { nickname, status, username } = params
    const queryBuilder = this.onlineUserRepository
      .createQueryBuilder('online')
      .leftJoinAndSelect('online.user', 'user')
      .innerJoin('online.accessToken', 'accessToken')
      .andWhere(username ? 'user.username LIKE :username' : '1=1', { username: `%${username}%` })
      .andWhere(nickname ? 'user.nickname LIKE :nickname' : '1=1', { nickname: `%${nickname}%` })
      .andWhere(status ? 'online.status = :status' : '1=1', { status })
    const result = await paginate(queryBuilder, paginateOptions)

    const flatItems = result.items.map((item) => {
      return {
        ...item,
        username: item.user?.username,
        nickname: item.user?.nickname,
        user: undefined,
      }
    })

    return {
      ...result,
      items: flatItems,
    }
  }

  async markSessionDisconnected(accessToken: string) {
    const token = await this.accessTokenEntity.findOneBy({ value: accessToken })
    if (!token) return

    const onlineUser = await this.onlineUserRepository.findOneBy({
      accessToken: { id: token.id },
    })
    if (onlineUser) {
      await this.onlineUserRepository.update(onlineUser.id, {
        logoutAt: new Date(),
        status: SysOnlineUserStatus.OFFLINE,
      })
    }
  }

  private async deleteSessionMetadataByTokenId(tokenId: string) {
    const onlineUser = await this.onlineUserRepository.findOneBy({
      accessToken: { id: tokenId },
    })
    if (onlineUser) {
      await this.onlineUserRepository.delete(onlineUser.id)
    }
  }

  private getTokenBlacklistTtl(expiresAt: number) {
    const now = Math.floor(Date.now() / 1000)
    return Math.max(expiresAt - now, 1)
  }

  private async getSessionPayload(accessToken: string): Promise<VerifyAuthUser | undefined> {
    try {
      return await this.jwtService.verifyAsync(accessToken)
    } catch {
      return undefined
    }
  }

  private async revokeTokenCache(accessToken: string, payload?: VerifyAuthUser) {
    try {
      if (payload?.exp) {
        await this.cacheService.setTokenBlacklist(
          accessToken,
          this.getTokenBlacklistTtl(payload.exp),
        )
      }
      if (payload?.uid) {
        await this.cacheService.delAuthToken(payload.uid)
      }
    } catch (error) {
      this.logger.warn(`清理会话缓存失败，继续删除持久化会话: ${(error as Error).message}`)
    }
  }
}
