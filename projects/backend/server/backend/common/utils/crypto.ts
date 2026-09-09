import { createHash, randomBytes, randomFillSync } from 'crypto'
import { authenticator } from 'otplib'
import { v4 as uuidv4 } from 'uuid'

/**
 * 生成指定长度的16进制字符粗
 * @param length 长度
 * @returns 16进制字符串
 */
export function randomHexString(length: number) {
  return randomBytes(length).toString('hex')
}

export function getSaltMD5(password: string, salt: string) {
  return md5(password + salt)
}

export function md5(data: string | Buffer) {
  return createHash('md5').update(data).digest('hex')
}

export function sha256(data: string) {
  return createHash('sha256').update(data).digest('hex')
}

export function generateSecretKey(keyLength = 128): string {
  // 定义允许的字符集
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  const randomValues = new Uint8Array(keyLength)
  randomFillSync(randomValues)

  let result = ''
  // 将随机值映射到允许的字符集
  for (let i = 0; i < keyLength; i++) {
    result += chars[randomValues[i] % chars.length]
  }

  return result
}

/**
 * 初始化 OTP 令牌
 * https://juejin.cn/post/7142687165095346207
 * @param userName 唯一的用户名
 * @param appName 项目名称
 * @returns secret 需要临时缓存的种子密钥
 */
export function generateOtpSecretToken(username: string, appName: string) {
  const secret = authenticator.generateSecret()
  const uri = authenticator.keyuri(username, appName, secret)
  return { secret, uri, uuid: uuidv4() }
}

/**
 * 判断令牌是否正确
 *
 * @param code 用户输入的一次性令牌
 * @param secret 用户对应的种子密钥
 * @returns {boolean} 令牌是否正确
 */
export function validateOtpSecretToken(code: string, secret: string) {
  return authenticator.check(code, secret)
}
