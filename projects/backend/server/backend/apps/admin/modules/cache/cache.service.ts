import { getConfig } from '@/common/utils'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import {
  genAuthPermKey,
  genAuthTokenKey,
  genCaptchaImgKey,
  genFileUUIDKey,
  genOptUrlCacheKey,
  genSystemParamCacheKey,
  genTokenBlacklistKey,
} from './redis-key'

const { captchaExpiresIn, optEnabledExpiresIn } = getConfig('admin')

@Injectable()
export class CacheService {
  @InjectRedis() private readonly redis: Redis

  setCaptcha(key: string, value: string) {
    return this.redis.set(genCaptchaImgKey(key), value, 'EX', captchaExpiresIn)
  }

  getCaptcha(key: string) {
    return this.redis.get(genCaptchaImgKey(key))
  }

  async getPermissions(uid: number): Promise<string[]> {
    const permissionString = await this.redis.get(genAuthPermKey(uid))
    return permissionString ? (JSON.parse(permissionString) as string[]) : []
  }

  async setPermissions(uid: number, permissions: string[]): Promise<void> {
    await this.redis.set(genAuthPermKey(uid), JSON.stringify(permissions))
  }

  async getAuthToken(uid: string): Promise<string[]> {
    const permissionString = await this.redis.get(genAuthTokenKey(uid))
    return permissionString ? (JSON.parse(permissionString) as string[]) : []
  }

  async setAuthToken(uid: number, token: string, exp: number): Promise<void> {
    await this.redis.set(genAuthTokenKey(uid), token, 'EX', exp)
  }

  async delAuthToken(uid: number): Promise<void> {
    await this.redis.del(genAuthTokenKey(uid))
  }

  setTokenBlacklist(token: string, exp: number) {
    return this.redis.set(genTokenBlacklistKey(token), token, 'EX', exp)
  }

  getTokenBlacklist(key: string) {
    return this.redis.get(genTokenBlacklistKey(key))
  }

  setOTPCache(uuid: string, secret: string) {
    return this.redis.set(genOptUrlCacheKey(uuid), secret, 'EX', optEnabledExpiresIn)
  }

  getOTPCache(uuid: string) {
    return this.redis.get(genOptUrlCacheKey(uuid))
  }

  /**
   * 设置系统变量
   */
  setSystemParams(key: string, value: string) {
    return this.redis.set(genSystemParamCacheKey(key), value)
  }

  getSystemParams(key: string) {
    return this.redis.get(genSystemParamCacheKey(key))
  }

  async delSystemParams(key: string): Promise<void> {
    await this.redis.del(genSystemParamCacheKey(key))
  }

  async delAllSystemParams(): Promise<void> {
    const keys = await this.redis.keys(genSystemParamCacheKey('*'))
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }

  /**
   * @param exp 单位毫秒
   */
  setFileUUID(key: string, value: string, exp = 60000) {
    return this.redis.set(genFileUUIDKey(key), value, 'PX', exp)
  }

  getFileUUID(key: string) {
    return this.redis.get(genFileUUIDKey(key))
  }

  /**
   * 通用失败次数处理
   */
  async incrementFailAttempt(opts: {
    prefix: string
    account: string
    ttl: number
    maxCount: number
  }): Promise<number> {
    const key = this.genFailLimitKey(opts.prefix, opts.account)
    const count = (await this.redis.eval(
      `local c = redis.call('INCR', KEYS[1])
       if c == 1 then
         redis.call('EXPIRE', KEYS[1], ARGV[1])
       end
       if c >= tonumber(ARGV[2]) then
         redis.call('EXPIRE', KEYS[1], ARGV[1])
       end
       return c`,
      1,
      key,
      opts.ttl,
      opts.maxCount,
    )) as number
    return count
  }

  async getFailAttempts(prefix: string, account: string): Promise<number> {
    const key = this.genFailLimitKey(prefix, account)
    const count = await this.redis.get(key)
    return count ? parseInt(count, 10) : 0
  }

  async clearFailAttempts(prefix: string, account: string): Promise<void> {
    const key = this.genFailLimitKey(prefix, account)
    await this.redis.del(key)
  }

  private genFailLimitKey(prefix: string, account: string): string {
    return `${getConfig('admin').sysPrefix}:fail_limit:${prefix}:${account}`
  }
}
