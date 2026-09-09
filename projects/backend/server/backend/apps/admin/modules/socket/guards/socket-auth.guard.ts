import { IS_PUBLIC_KEY } from '@/common/decorators'
import { IJwtService } from '@/apps/admin/modules/system/auth'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Socket } from 'socket.io'
import { SocketEvents } from '../constants'
import { gatewayMessageFormat } from '../response'

@Injectable()
export class SocketAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: IJwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const socket = context.switchToHttp().getRequest<Socket>()
    const token = socket.handshake.auth.token as string
    if (!token || !(await this.jwtService.checkToken(token))) {
      socket.send(gatewayMessageFormat(SocketEvents.AUTH_FAILED, '认证失败'))
      socket.disconnect()
      return false
    }

    return true
  }
}
