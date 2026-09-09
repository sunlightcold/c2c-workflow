import type { Request } from 'express'
import type { VerifyAuthUser } from './auth.interface'

export interface IpInfo {
  city: string
  country: string
  region: string
  timezone: string
}

export interface ClientInfo {
  ip: string
  browser: string
  os: string
  agent: string
  ipInfo: IpInfo
}

export interface IRequest extends Request {
  dataSource: unknown
  user: VerifyAuthUser
  clientInfo: ClientInfo
  accessToken: string
}
