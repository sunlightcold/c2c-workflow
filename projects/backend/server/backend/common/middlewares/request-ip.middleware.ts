import {
  Global,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestMiddleware,
  NestModule,
  Scope,
} from '@nestjs/common'
import { NextFunction, Response } from 'express'
import { lookup } from 'geoip-lite'
import requestIp from 'request-ip'
import { UAParser } from 'ua-parser-js'
import { ClientInfo, IRequest } from '../interfaces'

@Injectable({ scope: Scope.REQUEST })
class RequestIpMiddleware implements NestMiddleware {
  use(req: IRequest, res: Response, next: NextFunction) {
    const clientIp = requestIp.getClientIp(req) || 'unknown'

    res.setHeader('X-Request-IP', clientIp)

    const agent = UAParser(req.headers['user-agent'] || '')

    const ipInfo = lookup(clientIp)

    const clientInfo: ClientInfo = {
      ip: clientIp,
      browser: `${agent.browser.name || 'unknown'} ${agent.browser.version || 'unknown'}`,
      os: `${agent.os.name || 'unknown'} ${agent.os.version || 'unknown'}`,
      agent: agent.ua,
      ipInfo: {
        city: ipInfo?.city || 'unknown',
        country: ipInfo?.country || 'unknown',
        region: ipInfo?.region || 'unknown',
        timezone: ipInfo?.timezone || 'unknown',
      },
    }
    req.clientInfo = clientInfo

    next()
  }
}

@Global()
@Module({})
export class RequestIpMiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIpMiddleware).forRoutes('*')
  }
}
