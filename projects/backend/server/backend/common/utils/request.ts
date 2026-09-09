import type { Request } from 'express'

export function getFullUrlByRequest(request: Request) {
  return request.protocol + '://' + request.get('host') + request.originalUrl
}

/**
 * 通用重试操作函数
 *
 * @description
 * 该函数提供了一个通用的重试机制，特别适用于网络请求等不稳定操作。
 * 支持自定义重试次数、延迟时间和结果验证器。
 *
 * @param operation - 需要重试的异步操作函数
 * @param options - 重试配置选项
 * @param options.retries - 最大重试次数，默认为 6 次
 * @param options.delayMs - 重试间隔时间(毫秒)，默认为 600000ms (10分钟)
 * @param options.validator - 结果验证函数，返回 true 表示操作成功
 *
 * @returns 返回 operation 的执行结果
 * @throws 当重试次数耗尽后，将抛出最后一次失败的错误
 */
export async function retryPromise<T>(
  operation: () => Promise<T>,
  {
    retries = 6,
    delayMs = 600000,
    validator = (_result: T) => true,
  }: {
    retries?: number
    delayMs?: number
    validator?: (result: T) => boolean
  } = {},
): Promise<T> {
  try {
    const result = await operation()
    if (validator(result)) {
      return result
    }
    throw new Error(JSON.stringify(result))
  } catch (error) {
    if (retries === 0) {
      throw error
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs)
    })
    return retryPromise(operation, {
      retries: retries - 1,
      delayMs,
      validator,
    })
  }
}
