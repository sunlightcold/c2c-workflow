import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { IRequest } from '../interfaces'

export const Client = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request: IRequest = ctx.switchToHttp().getRequest()
  const info = request.clientInfo

  return info
})
