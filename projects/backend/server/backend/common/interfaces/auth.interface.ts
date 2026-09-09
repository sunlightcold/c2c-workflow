import type { Request } from 'express'
import type { UserType } from '../constants'

export interface AuthUser<T = number> {
  // 用户id (Admin为number, App为string/UUID)
  uid: T

  // -- Admin User 字段 --
  // 用户名
  username: string

  // -- App User 字段 --
  email?: string
  nickname?: string
  type?: string
  sessionId?: string
}

export interface VerifyAuthUser<T = number> extends AuthUser<T> {
  // 生成时间秒
  iat: number
  // 过期时间秒
  exp: number
}

// App Token Payload 规范
export interface AppTokenPayload {
  uid: string
  email?: string
  nickname?: string
  type: UserType.APP
  sessionId?: string
  isRefresh?: boolean
}

export interface AuthRequest extends Request {
  user: AuthUser
}
