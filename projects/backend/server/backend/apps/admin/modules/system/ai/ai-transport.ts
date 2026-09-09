import { Inject, Injectable } from '@nestjs/common'
import axios from 'axios'

export interface AiHttpCall {
  body: Record<string, unknown>
  headers: Record<string, string>
  timeoutMs: number
  url: string
}

export interface AiHttpTransport {
  post: (call: AiHttpCall) => Promise<unknown>
}

export class AiUpstreamRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message)
    this.name = AiUpstreamRequestError.name
  }
}

@Injectable()
export class AxiosAiHttpTransport implements AiHttpTransport {
  async post(call: AiHttpCall): Promise<unknown> {
    try {
      const response = await axios.post(call.url, call.body, {
        headers: call.headers,
        timeout: call.timeoutMs,
      })
      return response.data
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) throw error
      const status = error.response?.status
      const retryable = status === undefined || status === 429 || status >= 500
      const upstreamReason =
        describeAiUpstreamFailure(error.response?.data) ??
        describeAiNetworkFailure(error.message, error.code)
      const safeUpstreamReason = redactAiCredentialHeaders(upstreamReason, call.headers)
      throw new AiUpstreamRequestError(
        `AI upstream request failed${status ? ` with status ${status}` : ''}${
          safeUpstreamReason ? `: ${safeUpstreamReason}` : ''
        }`,
        retryable,
        status,
      )
    }
  }
}

function redactAiCredentialHeaders(
  value: string | undefined,
  headers: Record<string, string>,
): string | undefined {
  if (!value) return undefined
  let result = value
  for (const [name, secret] of Object.entries(headers)) {
    if (!/(authorization|api[-_]?key|token|secret)/i.test(name) || !secret) continue
    result = result.split(secret).join('[redacted]')
    const bearerToken = /^Bearer\s+(.+)$/i.exec(secret)?.[1]
    if (bearerToken) result = result.split(bearerToken).join('[redacted]')
  }
  return result
}

function describeAiNetworkFailure(message: string, code?: string): string | undefined {
  const safeMessage = readLogValue(message)
  const safeCode = readLogValue(code)
  if (!safeMessage && !safeCode) return undefined
  return `${safeMessage ?? 'AI upstream network request failed'}${
    safeCode ? ` (code=${safeCode})` : ''
  }`
}

function describeAiUpstreamFailure(value: unknown): string | undefined {
  if (typeof value === 'string') return sanitizeAiUpstreamLogText(value)
  const response = asLogRecord(value)
  const error = asLogRecord(response.error)
  const message = readLogValue(error.message ?? response.error ?? response.message)
  const attributes = [
    ['code', readLogValue(error.code ?? response.code)],
    ['type', readLogValue(error.type ?? response.type)],
    ['status', readLogValue(error.status ?? response.status)],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, detail]) => `${name}=${detail}`)
  if (!message && attributes.length === 0) return undefined
  return `${message ?? 'Upstream rejected the request'}${
    attributes.length ? ` (${attributes.join(', ')})` : ''
  }`
}

function asLogRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readLogValue(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  return sanitizeAiUpstreamLogText(String(value))
}

function sanitizeAiUpstreamLogText(value: string): string | undefined {
  const result = value
    .replace(/data:[^,\s]+,[^\s]+/gi, '[data-redacted]')
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[query-redacted]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000)
  return result || undefined
}

export const AI_HTTP_TRANSPORT = Symbol('AI_HTTP_TRANSPORT')

export abstract class AiHttpAdapter {
  constructor(@Inject(AI_HTTP_TRANSPORT) protected readonly transport: AiHttpTransport) {}

  protected asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  }

  protected readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }

  protected readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }
}
