import { Injectable, ForbiddenException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SysUserEntity, TenantEntity, BusinessStatus } from '@admin/database'
import { type AuthUser, StatusEnum } from '@/common/interfaces'
import { isSuperAdmin } from '@/common/utils'
import { CacheService } from '../cache'
import { BusinessScopeService } from '../business/business-scope.service'

@Injectable()
export class ChatAccessService {
  constructor(
    private readonly database: DataSource,
    private readonly cache: CacheService,
    private readonly scope: BusinessScopeService,
  ) {}
  async authorize(actor: AuthUser, tenantId?: string, reply = false) {
    const user = await this.database.getRepository(SysUserEntity).findOne({
      where: { id: actor.uid },
      select: {
        id: true,
        username: true,
        actorType: true,
        tenantId: true,
        status: true,
        authzVersion: true,
      },
    })
    if (!user || user.status !== StatusEnum.ENABLED) throw new ForbiddenException('聊天权限已失效')
    const current: AuthUser = {
      uid: user.id,
      username: user.username,
      actorType: user.actorType,
      tenantId: user.tenantId ?? undefined,
      authzVersion: user.authzVersion,
    }
    const permissions = isSuperAdmin(current)
      ? ['merchant:chat:read', 'merchant:chat:reply']
      : await this.cache.getPermissions(user.id)
    if (
      !permissions.includes('merchant:chat:read') ||
      (reply && !permissions.includes('merchant:chat:reply'))
    )
      throw new ForbiddenException('无聊天操作权限')
    const resolved = this.scope.resolveTenantId(current, tenantId)
    if (
      !(await this.database
        .getRepository(TenantEntity)
        .existsBy({ id: resolved, status: BusinessStatus.ACTIVE }))
    )
      throw new ForbiddenException('经营单位已停用')
    return resolved
  }
}
