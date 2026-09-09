import { RedisKeys } from './constants'

/** 生成验证码 redis key */
export function genCaptchaImgKey(val: string | number) {
  return `${RedisKeys.CAPTCHA_IMG_PREFIX}${String(val)}` as const
}

/** 生成 auth token redis key */
export function genAuthTokenKey(val: string | number) {
  return `${RedisKeys.AUTH_TOKEN_PREFIX}${String(val)}` as const
}

/** 生成 auth permission redis key */
export function genAuthPermKey(val: string | number) {
  return `${RedisKeys.AUTH_PERM_PREFIX}${String(val)}` as const
}

/** 生成 auth passwordVersion redis key */
export function genAuthPVKey(val: string | number) {
  return `${RedisKeys.AUTH_PASSWORD_V_PREFIX}${String(val)}` as const
}

/** 生成 token blacklist redis key */
export function genTokenBlacklistKey(tokenId: string) {
  return `${RedisKeys.TOKEN_BLACKLIST_PREFIX}${String(tokenId)}` as const
}

/** 生成 opt url cache redis key */
export function genOptUrlCacheKey(tokenId: string) {
  return `${RedisKeys.OPT_URL_CACHE_PREFIX}${String(tokenId)}` as const
}

/** 生成系统变量 key */
export function genSystemParamCacheKey(key: string) {
  return `${RedisKeys.SYS_PARAM_CACHE_PREFIX}${String(key)}` as const
}

/** 生成文件唯一码 key */
export function genFileUUIDKey(key: string) {
  return `${RedisKeys.FILE_UUID_PREFIX}${String(key)}` as const
}
