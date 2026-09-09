import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { RateLimitGuard } from '../guards/rate-limit.guard'

export interface RateLimitOptions {
  /**
   * 动作唯一标识，如 'avatar_update'
   */
  action: string
  /**
   * 限制的最高上限次数
   */
  limit: number
  /**
   * 时间窗口：按月、按天、按小时、按分钟
   */
  window: 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE'
  /**
   * 自定义报错信息。如：'本月头像修改次数已达上限'
   */
  errorMessage?: string
}

export const RATE_LIMIT_KEY = 'custom_rate_limit'

/**
 * 聚合装饰器：组合了元数据注入和 Guard 拦截
 * 这样在 Controller 中只需要写一行 @RateLimit(...)
 */
export const RateLimit = (options: RateLimitOptions | RateLimitOptions[]) => {
  return applyDecorators(SetMetadata(RATE_LIMIT_KEY, options), UseGuards(RateLimitGuard))
}
