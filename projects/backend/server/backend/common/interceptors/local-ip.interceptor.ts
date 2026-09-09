import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { IRequest } from '../interfaces'

@Injectable()
export class LocalIpInterceptor implements NestInterceptor {
  private readonly allowedIps = ['127.0.0.1', '::1', 'localhost']

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<IRequest>()
    const clientIp = request.clientInfo.ip

    if (!this.isLocalIp(clientIp)) {
      throw new ForbiddenException('只允许本地 IP 访问')
    }

    return next.handle()
  }

  private isLocalIp(ip: string): boolean {
    return (
      this.allowedIps.includes(ip) ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.20.') ||
      ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') ||
      ip.startsWith('172.23.') ||
      ip.startsWith('172.24.') ||
      ip.startsWith('172.25.') ||
      ip.startsWith('172.26.') ||
      ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') ||
      ip.startsWith('172.29.') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.')
    )
  }
}
