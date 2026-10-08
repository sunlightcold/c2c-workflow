import axios from 'axios'
import { Injectable, Logger } from '@nestjs/common'
import type { C2cHttpRequest, C2cHttpTransport } from './c2c-platform.types'

@Injectable()
export class AxiosC2cHttpTransport implements C2cHttpTransport {
  private readonly logger = new Logger(AxiosC2cHttpTransport.name)

  async request<T>(request: C2cHttpRequest): Promise<T> {
    const endpoint = new URL(request.url)
    const context = `method=${request.method}, endpoint=${endpoint.origin}${endpoint.pathname}`
    const shouldLog = this.shouldLogRequest(request.method, endpoint.pathname)
    const startedAt = Date.now()
    this.logRequestDetails(request, context, shouldLog)

    try {
      const response = await axios.request<T>({
        method: request.method,
        url: request.url,
        headers: request.headers,
        timeout: request.timeoutMs,
        data: request.body,
        params: request.params,
      })
      this.logResponse(response.data, response.status, context, shouldLog, Date.now() - startedAt)
      return response.data
    } catch (error) {
      this.logFailure(error, context, Date.now() - startedAt)
      // Preserve Axios status and response for adapter credential/error handling.
      throw error
    }
  }

  private shouldLogRequest(method: string, path: string): boolean {
    return (
      path.includes('/complaint/') ||
      path.includes('/file-upload/') ||
      path.includes('/appeal/') ||
      path === '/v3/c2c/files/' ||
      method === 'PUT'
    )
  }

  private logRequestDetails(request: C2cHttpRequest, context: string, shouldLog: boolean): void {
    if (!shouldLog) return
    this.logger.log(
      `C2C 申诉接口请求: ${context}, params=${JSON.stringify(this.logPayload(request.params ?? {}))}, body=${JSON.stringify(this.logPayload(request.body))}`,
    )
  }

  private logResponse(
    payload: unknown,
    status: number,
    context: string,
    shouldLog: boolean,
    durationMs: number,
  ): void {
    const businessFailure = this.isBusinessFailure(payload)
    if (!shouldLog && !businessFailure) return

    const message = `C2C 上游接口响应: ${context}, httpStatus=${status}, durationMs=${durationMs}, response=${JSON.stringify(this.logPayload(payload))}`
    if (businessFailure) this.logger.warn(message)
    else this.logger.log(message)
  }

  private isBusinessFailure(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false
    const envelope = payload as { success?: boolean; code?: string | number }
    return (
      envelope.success === false ||
      (envelope.code !== undefined && !['0', '000000'].includes(String(envelope.code)))
    )
  }

  private logFailure(error: unknown, context: string, durationMs: number): void {
    if (axios.isAxiosError(error)) {
      const response = JSON.stringify(this.logPayload(error.response?.data)) ?? 'none'
      const httpStatus = error.response?.status ?? 'none'
      const originalMessage = this.logPayload(error.message)
      error.message = `C2C 上游请求失败: ${context}, httpStatus=${httpStatus}, networkCode=${error.code ?? 'none'}, reason=${originalMessage}, response=${response}`
      this.logger.error(`${error.message}, durationMs=${durationMs}`)
      return
    }

    this.logger.error(
      `C2C 上游请求失败: ${context}, error=${error instanceof Error ? error.message : String(error)}, durationMs=${durationMs}`,
    )
  }

  private logPayload(value: unknown): unknown {
    if (Buffer.isBuffer(value)) return { bytes: value.length }
    if (value instanceof FormData) {
      return Object.fromEntries(
        [...value.entries()].map(([key, entry]) => [
          key,
          typeof entry === 'string'
            ? entry
            : { fileName: entry.name, bytes: entry.size, contentType: entry.type },
        ]),
      )
    }
    if (Array.isArray(value)) return value.map((item) => this.logPayload(item))
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          /^(authorization|cookie|token|accessToken|refreshToken|apiKey|secretKey|privateKey|signature)$/i.test(
            key,
          )
            ? '<REDACTED>'
            : this.logPayload(item),
        ]),
      )
    }
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      const url = new URL(value)
      for (const key of [...url.searchParams.keys()]) {
        if (/signature|credential|token|secret|api.?key/i.test(key)) url.searchParams.delete(key)
      }
      return url.toString()
    }
    return value
  }
}
