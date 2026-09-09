import { ErrorEnum } from '@/common/constants'
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CacheService } from 'apps/admin/modules/cache'
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY, PERMISSION_KEY } from '@/common/decorators'
import { AuthRequest } from '@/common/interfaces'
import { isSuperAdmin } from '@/common/utils'
import { AuthService } from '../auth.service'

@Injectable()
export class RbacAuthGuard implements CanActivate {
  @Inject(Reflector) private reflector: Reflector
  @Inject(AuthService) private authService: AuthService
  @Inject(CacheService) private cacheService: CacheService

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    const request = context.switchToHttp().getRequest<AuthRequest>()
    const { user } = request

    if (!user) {
      if (isOptionalAuth) return true
      throw new UnauthorizedException(ErrorEnum.INVALID_LOGIN)
    }

    const payloadPermission = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // 控制器没有设置接口权限，则默认通过
    if (!payloadPermission) return true
    // 拥有管理员权限，默认通过
    if (isSuperAdmin(user)) return true

    const allPermissions = await this.cacheService.getPermissions(user.uid)

    let canNext = false
    // handle permission strings
    if (Array.isArray(payloadPermission)) {
      canNext = payloadPermission.every((i) => allPermissions.includes(i))
    }
    if (typeof payloadPermission === 'string') canNext = allPermissions.includes(payloadPermission)

    if (!canNext) throw new ForbiddenException(ErrorEnum.FORBIDDEN)

    return true
  }
}
