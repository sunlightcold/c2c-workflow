import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'

/**
 * raw body 用于跳过全局 Validate Pipe 验证
 */
export const RawBody = createParamDecorator((_data: unknown, ctx: ExecutionContext): unknown => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.body
})
