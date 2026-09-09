import { ErrorEnum } from '@/common/constants'
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '@/common/decorators'
import { IRequest } from '@/common/interfaces'
import {
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { CacheService } from 'apps/admin/modules/cache'
import { ExtractJwt } from 'passport-jwt'
import { AuthStrategy } from '../constants'
import { IJwtService } from '../services'

@Injectable()
export class JwtAuthGuard extends AuthGuard(AuthStrategy.JWT) {
  @Inject(Reflector) private readonly reflector: Reflector
  @Inject(CacheService) private readonly cacheService: CacheService
  @Inject(IJwtService) private readonly jwtService: IJwtService

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    // 1. 如果是 @Public，严格放行，不解析 Token，保证速度和隔离性
    if (isPublic) {
      return true
    }

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // 解析 token 并将其挂载到 req.user
    await super.canActivate(context)

    const request = context.switchToHttp().getRequest<IRequest>()
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request) ?? ''
    request.accessToken = token

    if (!(await this.jwtService.checkToken(token))) {
      if (!isOptionalAuth) {
        throw new UnauthorizedException(ErrorEnum.INVALID_LOGIN)
      }
    }

    // 检查 token 是否在黑名单中
    if (await this.cacheService.getTokenBlacklist(token)) {
      if (!isOptionalAuth) {
        throw new UnauthorizedException(ErrorEnum.INVALID_LOGIN)
      }
    }

    return true
  }

  handleRequest<VerifyAuthUser>(
    err: HttpException,
    user: VerifyAuthUser,
    info: any,
    context: ExecutionContext,
  ) {
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (err || !user) {
      if (isOptionalAuth) {
        return null
      }
      throw new UnauthorizedException(ErrorEnum.INVALID_LOGIN)
    }
    return user
  }
}
