import { ErrorEnum } from '@/common/constants'
import { getConfig } from '@/common/utils'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import Redis from 'ioredis'

@Injectable()
export class UUIDGuard implements CanActivate {
  @InjectRedis() private readonly redis: Redis

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()

    const uuid = request.body.uuid
    if (!isUUID(uuid)) {
      throw new BadRequestException('UUID 为空或格式不正确！')
    }

    const sysPrefix = getConfig('admin').sysPrefix
    const key = `${sysPrefix}:request:uuid:${uuid}`

    if (await this.redis.get(key)) {
      throw new BadRequestException(ErrorEnum.INVALID_REQUEST)
    }
    await this.redis.set(key, uuid, 'PX', 60000)
    return true
  }
}
