import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common'
import { FailLimitInterceptor } from '../interceptors/fail-limit.interceptor'

export interface FailLimitOptions {
  /** 限制类型的业务前缀，如 'login', 'sms' 等，用于区分不同的限制场景 */
  prefix: string
  /** 最大失败次数 */
  maxCount: number
  /** 锁定时长，单位秒 */
  lockTime: number
  /** Body中作为账号标识的字段名 (e.g., 'email' or 'username')。如果不传且 enableIp 为 true，则仅限制 IP */
  keyField?: string
  /**
   * 是否启用 IP 验证。
   * 如果仅启用 IP 验证，则不传递 keyField 即可；
   * 如果同时传递 keyField 和 enableIp，则通过 ${keyField}:${ip} 进行双重限制
   */
  enableIp?: boolean
  /** 账号被锁定时抛出的错误信息 */
  lockedMessage?: string | ((lockTimeInSeconds: number, maxCount: number) => string)
  /** 追加在原异常后面的警告信息模板 */
  warningMessage?: string | ((remainCount: number, maxCount: number) => string)
  /** 自定义过滤器：判断该异常是否应计入失败次数。默认匹配 400/401/403 状态码 */
  errorFilter?: (err: unknown) => boolean
}

export const FAIL_LIMIT_KEY = 'fail_limit_key'

export const FailLimit = (options: FailLimitOptions) => {
  return applyDecorators(
    SetMetadata(FAIL_LIMIT_KEY, options),
    UseInterceptors(FailLimitInterceptor),
  )
}
