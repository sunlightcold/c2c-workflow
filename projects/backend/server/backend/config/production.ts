const productionConfig = {
  common: {
    env: 'production',
    timeZone: process.env.C2C_TIME_ZONE ?? 'Asia/Shanghai',
    dbTimeZone: 'UTC',
    superAdminUid: Number(process.env.C2C_SUPER_ADMIN_UID ?? '1'),
    superAdminName: process.env.C2C_SUPER_ADMIN_NAME ?? 'superAdmin',
    superAdminPassword: process.env.C2C_SUPER_ADMIN_PASSWORD ?? '',
  },
  admin: {
    sysPrefix: process.env.C2C_REDIS_PREFIX ?? 'c2c',
    port: Number(process.env.C2C_BACKEND_PORT ?? '3000'),
    accessTokenExpiresIn: 86400,
    captchaExpiresIn: 60000,
    optEnabledExpiresIn: 300000,
    throttlerTTL: 10000,
    throttlerLimit: 200,
    maxFileSize: 1024 * 1024 * 10,
    staticDirName: 'static',
    staticServerUrl: process.env.C2C_STATIC_SERVER_URL ?? '',
    credentialMasterKey: process.env.C2C_CREDENTIAL_MASTER_KEY ?? '',
    postgres: {
      host: process.env.C2C_POSTGRES_HOST ?? '',
      port: Number(process.env.C2C_POSTGRES_PORT ?? '5432'),
      username: process.env.C2C_POSTGRES_USER ?? '',
      password: process.env.C2C_POSTGRES_PASSWORD ?? '',
      database: process.env.C2C_POSTGRES_DB ?? '',
      synchronize: false,
      logging: false,
    },
    redis: {
      url: process.env.C2C_REDIS_URL ?? '',
    },
  },
}

export = productionConfig
