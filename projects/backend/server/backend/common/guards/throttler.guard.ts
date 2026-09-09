import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { IRequest } from '../interfaces'

@Injectable()
export class IThrottlerGuard extends ThrottlerGuard {
  getTracker(req: IRequest): Promise<string> {
    return Promise.resolve(req.clientInfo.ip)
  }
}
