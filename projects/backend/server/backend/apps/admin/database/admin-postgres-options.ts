import { getConfig } from '@/common/utils/config'

export function getAdminPostgresOptions() {
  const pgConfig = getConfig('admin').postgres
  const dbTimeZone = getConfig('common').dbTimeZone

  return {
    type: 'postgres' as const,
    host: pgConfig.host,
    port: pgConfig.port,
    username: pgConfig.username,
    password: pgConfig.password,
    database: pgConfig.database,
    synchronize: pgConfig.synchronize,
    logging: pgConfig.logging,
    extra: {
      options: `-c timezone=${dbTimeZone}`,
    },
  }
}
