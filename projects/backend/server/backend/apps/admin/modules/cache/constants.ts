import { getConfig } from '@/common/utils'

const sysPrefix = getConfig('admin').sysPrefix

export const RedisKeys = {
  CAPTCHA_IMG_PREFIX: `${sysPrefix}:captcha:img:`,
  AUTH_TOKEN_PREFIX: `${sysPrefix}:auth:token:`,
  AUTH_PERM_PREFIX: `${sysPrefix}:auth:permission:`,
  AUTH_PASSWORD_V_PREFIX: `${sysPrefix}:auth:passwordVersion:`,
  TOKEN_BLACKLIST_PREFIX: `${sysPrefix}:token:blacklist:`,
  OPT_URL_CACHE_PREFIX: `${sysPrefix}:opturl:cache:`,
  SYS_PARAM_CACHE_PREFIX: `${sysPrefix}:system:params:`,
  FILE_UUID_PREFIX: `${sysPrefix}:file:uuid:`,
}
