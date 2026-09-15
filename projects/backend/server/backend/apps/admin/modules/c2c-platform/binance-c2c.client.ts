import { createHmac } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import {
  C2C_HTTP_TRANSPORT,
  type C2cCapabilities,
  type C2cComplaintPayload,
  type C2cComplaintReason,
  type C2cComplaintUpload,
  type C2cHttpTransport,
  type C2cListInput,
  type C2cMarkPaidOptions,
  type C2cMarkPaidPolicy,
  type C2cPlatformAdapter,
} from './c2c-platform.types'
import { normalizeBinanceDetail, normalizeBinanceSummary } from './c2c-order-normalizer'

export interface BinanceCredentials {
  apiKey: string
  baseUrl?: string
  secretKey: string
  clientType: string
  timeoutMs: number
  xUserId?: string
}

interface BinanceEnvelope<T> {
  success: boolean
  code: string
  message?: string
  data: T
  total?: number
}

interface BinanceListEnvelope<T> extends BinanceEnvelope<T> {
  total?: number
}

interface BinanceChatCredential {
  chatWssUrl: string
  listenKey: string
  listenToken: string
}

export type BinanceComplaintReason = C2cComplaintReason
export type BinanceComplaintUpload = C2cComplaintUpload
export type BinanceComplaintPayload = C2cComplaintPayload

@Injectable()
export class BinanceC2cClient implements C2cPlatformAdapter<BinanceCredentials> {
  constructor(@Inject(C2C_HTTP_TRANSPORT) private readonly http: C2cHttpTransport) {}

  async listOrders(credentials: BinanceCredentials, input: C2cListInput) {
    if (input.tradeType !== 'BUY') throw new Error('币安 C2C 仅支持 BUY 买币订单')
    const response = await this.postList<Record<string, unknown>[]>(
      credentials,
      '/sapi/v1/c2c/orderMatch/listOrders',
      input,
    )
    const hasUpstreamTotal = response.total !== undefined && Number.isFinite(Number(response.total))
    const total = hasUpstreamTotal ? Number(response.total) : response.data.length
    const items = response.data
      .filter((item) => String(item.tradeType).toUpperCase() === 'BUY')
      .map(normalizeBinanceSummary)
    return {
      items,
      total,
      hasMore:
        response.data.length > 0 &&
        (hasUpstreamTotal ? input.page * input.rows < total : response.data.length === input.rows),
    }
  }

  async getOrderDetail(credentials: BinanceCredentials, orderNumber: string) {
    const response = await this.post<Record<string, unknown>>(
      credentials,
      '/sapi/v1/c2c/orderMatch/getUserOrderDetail',
      { adOrderNo: orderNumber },
    )
    return normalizeBinanceDetail(response.data, orderNumber)
  }

  markOrderAsPaid(
    credentials: BinanceCredentials,
    orderNumber: string,
    paymentMethodId: number | string,
    _options?: C2cMarkPaidOptions,
  ) {
    const payId = Number(paymentMethodId)
    if (!Number.isSafeInteger(payId) || payId <= 0) throw new Error('币安 payId 无效')
    return this.post(credentials, '/sapi/v1/c2c/orderMatch/markOrderAsPaid', {
      orderNumber,
      payId,
    })
  }

  async sendChatText(credentials: BinanceCredentials, orderNumber: string, content: string) {
    const response = await this.get<BinanceChatCredential>(
      credentials,
      '/sapi/v1/c2c/chat/retrieveChatCredential',
      {},
    )
    const chat = response.data
    if (!chat?.chatWssUrl || !chat.listenKey || !chat.listenToken) {
      throw new Error('币安 C2C 聊天凭据返回无效')
    }
    const WebSocketConstructor = globalThis.WebSocket
    if (!WebSocketConstructor) throw new Error('当前 Node.js 不支持 WebSocket')
    const url = `${chat.chatWssUrl.replace(/\/+$/, '')}/${encodeURIComponent(chat.listenKey)}?token=${encodeURIComponent(chat.listenToken)}&clientType=web`
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocketConstructor(url)
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('币安 C2C 聊天发送超时'))
      }, credentials.timeoutMs)
      timer.unref?.()
      let opened = false
      socket.addEventListener('open', () => {
        opened = true
        socket.send(
          JSON.stringify({
            uuid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            orderNo: orderNumber,
            createTime: Date.now(),
            type: 'text',
            content,
            self: true,
            clientType: 'web',
            sendStatus: 0,
          }),
        )
        this.waitForChatBuffer(socket, credentials.timeoutMs)
          .then(() => {
            clearTimeout(timer)
            socket.close()
            resolve()
          })
          .catch((error) => {
            clearTimeout(timer)
            socket.close()
            reject(error instanceof Error ? error : new Error(String(error)))
          })
      })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        socket.close()
        reject(new Error('币安 C2C 聊天连接失败'))
      })
      socket.addEventListener('close', () => {
        if (!opened) {
          clearTimeout(timer)
          reject(new Error('币安 C2C 聊天连接已关闭'))
        }
      })
    })
    return { supported: true }
  }

  async getComplaintReasons(credentials: BinanceCredentials, orderNo: string) {
    const response = await this.post<BinanceComplaintReason[]>(
      credentials,
      '/sapi/v1/c2c/complaint/get-complaint-reasons',
      { orderNo },
    )
    return response.data
  }

  async getComplaintUploadUrl(credentials: BinanceCredentials, fileName: string) {
    const response = await this.get<BinanceComplaintUpload>(
      credentials,
      '/sapi/v1/c2c/file-upload/get-s3-presigned-url',
      { fileName, scenario: 'complaint' },
    )
    return response.data
  }

  uploadComplaintFile(uploadUrl: string, content: Buffer) {
    return this.http.request<unknown>({
      method: 'PUT',
      url: uploadUrl,
      headers: { 'Content-Type': 'application/octet-stream' },
      timeoutMs: 30_000,
      body: content,
    })
  }

  submitComplaint(credentials: BinanceCredentials, payload: BinanceComplaintPayload) {
    return this.post<{ complaintNo?: number | string }>(
      credentials,
      '/sapi/v1/c2c/complaint/submit-complaint',
      payload,
    )
  }

  getCapabilities(): C2cCapabilities {
    return {
      appeal: true,
      cancelOrder: false,
      chat: true,
      checkAntiFraud: false,
      listOrders: true,
      listReportOrders: false,
      getOrderDetail: true,
      markOrderAsPaid: true,
      releaseCrypto: false,
      sellOrders: false,
    }
  }

  getMarkPaidPolicy(_credentials: BinanceCredentials): C2cMarkPaidPolicy {
    return { paymentProof: 'NONE' }
  }

  private async post<T>(credentials: BinanceCredentials, path: string, body: unknown) {
    return this.request<BinanceEnvelope<T>>(credentials, path, body)
  }

  private async postList<T>(credentials: BinanceCredentials, path: string, body: unknown) {
    return this.request<BinanceListEnvelope<T>>(credentials, path, body)
  }

  private async get<T>(
    credentials: BinanceCredentials,
    path: string,
    params: Record<string, string>,
  ) {
    return this.request<BinanceEnvelope<T>>(credentials, path, undefined, 'GET', params)
  }

  private async request<T extends BinanceEnvelope<unknown>>(
    credentials: BinanceCredentials,
    path: string,
    body: unknown,
    method: 'GET' | 'POST' = 'POST',
    params: Record<string, string> = {},
  ) {
    const query = new URLSearchParams({
      ...params,
      recvWindow: '5000',
      timestamp: String(Date.now()),
    }).toString()
    const signature = createHmac('sha256', credentials.secretKey).update(query).digest('hex')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-MBX-APIKEY': credentials.apiKey,
      clientType: credentials.clientType,
    }
    if (credentials.xUserId) headers['x-user-id'] = credentials.xUserId
    const response = await this.http.request<T>({
      method,
      url: `${(credentials.baseUrl ?? 'https://api.binance.com').replace(/\/$/, '')}${path}?${query}&signature=${signature}`,
      headers,
      timeoutMs: credentials.timeoutMs,
      body,
    })
    if (!response.success || response.code !== '000000')
      throw new Error(`[${response.code}] ${response.message ?? '币安 C2C 请求失败'}`)
    return response
  }

  private waitForChatBuffer(socket: WebSocket, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const check = () => {
        if (socket.bufferedAmount === 0) return resolve()
        if (Date.now() - startedAt >= timeoutMs) return reject(new Error('币安 C2C 聊天发送超时'))
        setTimeout(check, 25)
      }
      check()
    })
  }
}
