import type defaultConfig from '@/config/development'
import config from 'config'

// 强制显式定义类型或确保其包含 app 等拓展配置项
type Config = typeof defaultConfig

export function getConfig<K extends keyof Config>(key: K): Config[K] {
  return config.get(key)
}

export function isDevMode() {
  return getConfig('common').env === 'development'
}

export function assertRuntimeConfig(): void {
  if (getConfig('common').env !== 'production') return

  const common = getConfig('common')
  const admin = getConfig('admin')
  const requiredValues: Array<[string, unknown]> = [
    ['C2C_SUPER_ADMIN_PASSWORD', common.superAdminPassword],
    ['C2C_CREDENTIAL_MASTER_KEY', admin.credentialMasterKey],
    ['C2C_POSTGRES_HOST', admin.postgres.host],
    ['C2C_POSTGRES_USER', admin.postgres.username],
    ['C2C_POSTGRES_PASSWORD', admin.postgres.password],
    ['C2C_POSTGRES_DB', admin.postgres.database],
    ['C2C_REDIS_URL', admin.redis.url],
  ]
  const missing = requiredValues
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(`Missing required runtime configuration: ${missing.join(', ')}`)
  }
}
