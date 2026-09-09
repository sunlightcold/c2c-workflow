import { UnauthorizedException } from '@nestjs/common'
import { ErrorEnum } from '../constants'
import { getSaltMD5 } from './crypto'

/**
 * 验证密码
 */
export function checkPwd(
  inputPassword: string,
  userPassword: string,
  salt: string,
  errMsg?: string,
) {
  const md5 = getSaltMD5(inputPassword, salt)
  if (userPassword !== md5) {
    throw new UnauthorizedException(errMsg ?? ErrorEnum.INVALID_LOGIN_PARAMS)
  }
  return true
}

/**
 * 验证IP白名单
 */
export function checkIpWhiteList(ip: string, ipWhiteList?: string) {
  if (typeof ipWhiteList === 'string') {
    const ips = ipWhiteList.split('|')
    return ips.includes(ip)
  }
  return true
}
