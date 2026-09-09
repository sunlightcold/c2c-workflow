import { createBusinessTimeBucket } from '@/common/time'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators'

const rateLimitWindowToBucket = {
  DAY: 'day',
  HOUR: 'hour',
  MINUTE: 'minute',
  MONTH: 'month',
} as const

@Injectable()
export class RateLimitGuard implements CanActivate {
  @InjectRedis() private readonly redis: Redis

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions | RateLimitOptions[]>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    )
    if (!options) return true

    const request = context.switchToHttp().getRequest<{ user?: { uid?: string | number } }>()
    const user = request.user

    // 如果接口没有鉴权 User 信息，无法按用户维度限流，直接放行或者根据 IP 限流（这里采用放行）
    if (!user || !user.uid) return true

    const rules = Array.isArray(options) ? options : [options]
    const response = context.switchToHttp().getResponse()

    for (const rule of rules) {
      const { action, limit, window, errorMessage } = rule
      const bucket = createBusinessTimeBucket(rateLimitWindowToBucket[window])

      const key = `app:rate_limit:${action}:${user.uid}:${bucket.key}`

      const currentCount = await this.redis.incr(key)
      if (currentCount === 1) {
        await this.redis.expire(key, bucket.expiresInSeconds)
      }

      if (currentCount > limit) {
        const msg = errorMessage || `该操作太过频繁，请稍后再试。`
        throw new HttpException(msg, HttpStatus.TOO_MANY_REQUESTS)
      }

      if (response && response.header) {
        response.header('X-RateLimit-Limit', limit.toString())
        response.header('X-RateLimit-Remaining', Math.max(0, limit - currentCount).toString())
      }
    }

    return true
  }
}
