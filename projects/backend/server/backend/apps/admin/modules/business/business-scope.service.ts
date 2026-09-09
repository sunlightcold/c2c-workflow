import { ActorType, type AuthUser } from '@/common/interfaces'
import { ForbiddenException, Injectable } from '@nestjs/common'

@Injectable()
export class BusinessScopeService {
  resolveTenantId(actor: AuthUser, requestedTenantId?: string): string {
    if (actor.actorType === ActorType.TENANT) {
      if (!actor.tenantId || (requestedTenantId && requestedTenantId !== actor.tenantId)) {
        throw new ForbiddenException('所属单位访问范围不匹配')
      }
      return actor.tenantId
    }
    if (actor.actorType === ActorType.PLATFORM && requestedTenantId) return requestedTenantId
    throw new ForbiddenException('必须选择经营所属单位')
  }
}
