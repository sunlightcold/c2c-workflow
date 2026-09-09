import { getConfig } from '@/common/utils'
import type { BullRootModuleOptions } from '@nestjs/bullmq'

const adminConfig = getConfig('admin')

export function createBullMqRootOptions(): BullRootModuleOptions {
  return {
    connection: {
      url: adminConfig.redis.url,
    },
    prefix: adminConfig.sysPrefix,
  }
}
