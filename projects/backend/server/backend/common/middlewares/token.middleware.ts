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
import { IRequest } from '../interfaces'

@Injectable({ scope: Scope.REQUEST })
class TokenMiddleware implements NestMiddleware {
  use(req: IRequest, res: Response, next: NextFunction) {
    const authorization = req.headers.authorization
    if (authorization) {
      req.accessToken = authorization.split(' ').pop()!
    }
    next()
  }
}

@Global()
@Module({})
export class TokenMiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TokenMiddleware).forRoutes('*')
  }
}
