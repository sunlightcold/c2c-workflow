import { createHmac } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import {
  C2C_HTTP_TRANSPORT,
  type C2cCapabilities,
  type C2cHttpTransport,
  type C2cListInput,
} from './c2c-platform.types'
import { normalizeBinanceDetail, normalizeBinanceSummary } from './c2c-order-normalizer'

const BINANCE_ORIGIN = 'https://api.binance.com'

export interface BinanceCredentials {
  apiKey: string
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

@Injectable()
export class BinanceC2cClient {
  constructor(@Inject(C2C_HTTP_TRANSPORT) private readonly http: C2cHttpTransport) {}

  async listOrders(credentials: BinanceCredentials, input: C2cListInput) {
    if (input.tradeType !== 'BUY') throw new Error('币安 C2C 仅支持 BUY 买币订单')
    const response = await this.postList<Record<string, unknown>[]>(
      credentials,
      '/sapi/v1/c2c/orderMatch/listOrders',
      input,
    )
    return {
      items: response.data.map(normalizeBinanceSummary),
      total: Number(response.total ?? response.data.length),
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

  markOrderAsPaid(credentials: BinanceCredentials, orderNumber: string, payId: number) {
    if (!Number.isSafeInteger(payId) || payId <= 0) throw new Error('币安 payId 无效')
    return this.post(credentials, '/sapi/v1/c2c/orderMatch/markOrderAsPaid', {
      orderNumber,
      payId,
    })
  }

  getCapabilities(): C2cCapabilities {
    return { listOrders: true, getOrderDetail: true, markOrderAsPaid: true, sellOrders: false }
  }

  private async post<T>(credentials: BinanceCredentials, path: string, body: unknown) {
    return this.request<BinanceEnvelope<T>>(credentials, path, body)
  }

  private async postList<T>(credentials: BinanceCredentials, path: string, body: unknown) {
    return this.request<BinanceListEnvelope<T>>(credentials, path, body)
  }

  private async request<T extends BinanceEnvelope<unknown>>(
    credentials: BinanceCredentials,
    path: string,
    body: unknown,
  ) {
    const query = new URLSearchParams({
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
      method: 'POST',
      url: `${BINANCE_ORIGIN}${path}?${query}&signature=${signature}`,
      headers,
      timeoutMs: credentials.timeoutMs,
      body,
    })
    if (!response.success || response.code !== '000000')
      throw new Error(`[${response.code}] ${response.message ?? '币安 C2C 请求失败'}`)
    return response
  }
}
