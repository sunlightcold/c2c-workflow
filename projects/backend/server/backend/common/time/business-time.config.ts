import {
  DEFAULT_BUSINESS_TIME_ZONE,
  DEFAULT_DATABASE_TIME_ZONE,
  type BusinessTimeConfig,
} from './business-time.types'
import { getConfig } from '@/common/utils/config'

export function resolveBusinessTimeConfig(options: Partial<BusinessTimeConfig> = {}) {
  if (options.dbTimeZone || options.timeZone) {
    return {
      dbTimeZone: options.dbTimeZone ?? DEFAULT_DATABASE_TIME_ZONE,
      timeZone: options.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE,
    }
  }

  const commonConfig = resolveConfiguredBusinessTime()
  return {
    dbTimeZone: commonConfig?.dbTimeZone ?? DEFAULT_DATABASE_TIME_ZONE,
    timeZone: commonConfig?.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE,
  }
}

function resolveConfiguredBusinessTime(): Partial<BusinessTimeConfig> | undefined {
  try {
    return getConfig('common') as Partial<BusinessTimeConfig>
  } catch {
    return undefined
  }
}
