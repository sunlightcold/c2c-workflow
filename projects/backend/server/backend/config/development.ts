const env = process.env

export default {
  common: {
    env: 'development',
    timeZone: env.C2C_TIME_ZONE ?? 'Asia/Shanghai',
    dbTimeZone: 'UTC',
    superAdminUid: Number(env.C2C_SUPER_ADMIN_UID ?? '1'),
    superAdminName: env.C2C_SUPER_ADMIN_NAME ?? '老伍',
    superAdminPassword: env.C2C_SUPER_ADMIN_PASSWORD ?? '123456',
  },
  admin: {
    sysPrefix: env.C2C_REDIS_PREFIX ?? 'c2c',
    port: Number(env.C2C_BACKEND_PORT ?? '13001'),
    accessTokenExpiresIn: 86400,
    captchaExpiresIn: 60000,
    optEnabledExpiresIn: 300000,
    throttlerTTL: 10000,
    throttlerLimit: 200,
    maxFileSize: 1024 * 1024 * 10,
    staticDirName: 'static',
    staticServerUrl: env.C2C_STATIC_SERVER_URL ?? 'http://localhost:13001',
    credentialMasterKey: env.C2C_CREDENTIAL_MASTER_KEY ?? '',
    postgres: {
      host: env.C2C_POSTGRES_HOST ?? 'localhost',
      port: Number(env.C2C_POSTGRES_PORT ?? '15433'),
      username: env.C2C_POSTGRES_USER ?? 'postgres',
      password: env.C2C_POSTGRES_PASSWORD ?? '',
      database: env.C2C_POSTGRES_DB ?? 'c2c_backend',
      synchronize: false,
      logging: false,
    },
    redis: {
      url: env.C2C_REDIS_URL ?? 'redis://localhost:16380',
    },
  },
}
