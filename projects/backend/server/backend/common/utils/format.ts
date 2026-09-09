import { isNaN } from 'lodash'
import { normalize } from 'path'

export function safeParseJson<T = unknown>(json: string, errorVal?: T): T | string {
  if (typeof json !== 'string') {
    return errorVal ?? json
  }
  try {
    return JSON.parse(json) as T
  } catch {
    return errorVal ?? json
  }
}

export function safeStringify(data: unknown, errorVal?: string): string {
  try {
    return JSON.stringify(data)
  } catch {
    return errorVal ?? String(data)
  }
}

/**
 * 安全转换值为数字类型，使用 lodash
 * @param value 需要转换的值
 * @param defaultValue 转换失败时返回的默认值，默认为0
 * @returns 转换后的数字或默认值
 */
export function safeToNumber(value: unknown, defaultValue = 0): number {
  if (typeof value !== 'string' && typeof value !== 'number') return defaultValue
  const num = Number(value)
  return !isNaN(num) && isFinite(num) ? num : defaultValue
}

/**
 * 格式化秘钥，将中间部分替换为星号，只保留首尾部分
 * @param key 需要格式化的秘钥
 * @param prefixLength 保留前缀的长度，默认为6
 * @param suffixLength 保留后缀的长度，默认为6
 * @param maskChar 替换字符，默认为*
 * @returns 格式化后的秘钥
 */
export function formatSecretKey(
  key: string,
  prefixLength = 6,
  suffixLength = 6,
  maskChar = '*',
): string {
  if (!key) return ''

  const keyLength = key.length

  // 如果秘钥长度小于等于前缀长度+后缀长度，则不做处理
  if (keyLength <= prefixLength + suffixLength) {
    return key
  }

  const prefix = key.substring(0, prefixLength)
  const suffix = key.substring(keyLength - suffixLength)
  const maskLength = 6 // 固定使用6个掩码字符
  const mask = maskChar.repeat(maskLength)

  return `${prefix}${mask}${suffix}`
}

/**
 * 替换URL中的参数占位符
 *
 * @description
 * 该函数用于替换URL中的参数占位符，例如 /api/:id/:name 中的 :id 和 :name
 *
 * @param url - 包含参数占位符的URL字符串
 * @param params - 包含参数值的对象
 * @returns 替换后的URL字符串
 * @example
 * ```typescript
 * // 返回 "/api/123/john"
 * replaceUrlParams("/api/:id/:name", { id: 123, name: "john" })
 * ```
 */
export function replaceUrlParams(url: string, params: Record<string, unknown>): string {
  let result = url

  Object.keys(params).forEach((key) => {
    const placeholder = `:${key}`
    result = result.replaceAll(placeholder, String(params[key]))
  })

  return result
}

/**
 * 替换 URL 中的参数占位符
 * @param url - 包含参数占位符的 URL 字符串，例如：/api/safeTradeInfo/query/{tradeId}
 * @param params - 包含参数值的对象
 * @returns 替换后的 URL 字符串
 */
export function replaceUrlParams2(url: string, params: Record<string, unknown>): string {
  return url.replace(/{([^}]+)}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key])
    }
    // 如果找不到对应的参数，则保留原始占位符
    return _
  })
}

/**
 * 将路径转换为标准格式（使用 / 分隔）
 */
export function normalizePath(path: string): string {
  return normalize(path).replace(/\\/g, '/')
}

export function base64ToImgSrc(base64: string, type = 'png') {
  return `data:image/${type};base64,${base64}`
}
