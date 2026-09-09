import { SysAccessTokenEntity } from '@/apps/admin/database'
import { AuthUser, VerifyAuthUser } from '@/common/interfaces'
import { addTime } from '@/common/time'
import { getConfig } from '@/common/utils'
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { CacheService } from '@admin/modules/cache'
import { Repository } from 'typeorm'
import { JwtConstants } from '../constants'

@Injectable()
export class IJwtService {
  @InjectRepository(SysAccessTokenEntity)
  private readonly accessTokenRepository: Repository<SysAccessTokenEntity>
  @Inject(JwtService) private readonly jwtService: JwtService
  @Inject(CacheService) private readonly cacheService: CacheService

  async getAccessToken(token: string) {
    const accessToken = await this.accessTokenRepository.findOneBy({ value: token })
    return accessToken
  }

  async signAccessToken(payload: AuthUser) {
    const token = this.jwtService.sign(payload, { secret: JwtConstants.secret })
    const adminConfig = getConfig('admin')
    const expiredAt = addTime(new Date(), adminConfig.accessTokenExpiresIn, 'second').toISOString()
    await this.accessTokenRepository.save({ value: token, expiredAt, user: { id: payload.uid } })
    await this.cacheService.setAuthToken(payload.uid, token, adminConfig.accessTokenExpiresIn)
    return token
  }

  verifyAsync(token: string): Promise<VerifyAuthUser> {
    return this.jwtService.verifyAsync<VerifyAuthUser>(token, { secret: JwtConstants.secret })
  }

  async checkToken(token: string): Promise<boolean> {
    if (typeof token !== 'string') return false

    let payload: VerifyAuthUser
    try {
      payload = await this.verifyAsync(token)
    } catch {
      return false
    }

    if (!payload) return false
    if (await this.cacheService.getTokenBlacklist(token)) return false
    const accessToken = await this.getAccessToken(token)
    return !!accessToken
  }

  async finAllTokenByUserId(id: number) {
    return await this.accessTokenRepository.find({ where: { user: { id } } })
  }
}
