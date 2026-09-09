import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { AuthUser, IRequest } from '../interfaces'

export const User = createParamDecorator<keyof AuthUser>((data: string, ctx: ExecutionContext) => {
  const request: IRequest = ctx.switchToHttp().getRequest()
  const user = request.user

  return data ? user?.[data] : user
})
