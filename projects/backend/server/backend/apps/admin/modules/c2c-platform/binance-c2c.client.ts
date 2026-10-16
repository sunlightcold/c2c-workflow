import { createHmac } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import Ws from 'ws'
import { ProxyNetworkService, type ProxyScope } from '../proxy/proxy-network.service'
import {
  C2C_HTTP_TRANSPORT,
  C2cRequestRejectedError,
  type C2cCapabilities,
  type C2cComplaintPayload,
  type C2cComplaintReason,
  type C2cComplaintUpload,
  type C2cHttpTransport,
  type C2cListInput,
  type C2cMarkPaidOptions,
  type C2cMarkPaidPolicy,
  type C2cPlatformAdapter,
  type C2cReportInput,
} from './c2c-platform.types'
import {
  normalizeBinanceDetail,
  normalizeBinanceSummary,
  normalizeBinanceReportSummary,
} from './c2c-order-normalizer'
import type { C2cAd, C2cAdMarketQuery, C2cAdMarketSnapshot } from './c2c-ad.types'
import { normalizeBinanceAd, normalizeBinanceMarketQuote } from './c2c-ad-normalizer'

export interface BinanceCredentials {
  proxyScope?: ProxyScope
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
  constructor(
    @Inject(C2C_HTTP_TRANSPORT) private readonly http: C2cHttpTransport,
    private readonly network: ProxyNetworkService,
  ) {}

  async listAds(credentials: BinanceCredentials) {
    const ads: C2cAd[] = []
    const rows = 100
    for (let page = 1; ; page += 1) {
      const response = await this.postList<Record<string, unknown>[]>(
        credentials,
        '/sapi/v1/c2c/ads/listWithPagination',
        { page, rows },
      )
      ads.push(...response.data.map(normalizeBinanceAd))
      if (
        response.data.length < rows ||
        (response.total !== undefined && page * rows >= response.total)
      ) {
        return ads
      }
    }
  }

  async getAd(credentials: BinanceCredentials, platformAdId: string) {
    const response = await this.request<BinanceEnvelope<Record<string, unknown>>>(
      credentials,
      '/sapi/v1/c2c/ads/getDetailByNo',
      undefined,
      'POST',
      { adsNo: platformAdId },
    )
    const ad = normalizeBinanceAd(response.data)
    if (ad.platformAdId !== platformAdId) throw new Error('币安返回的广告编号不匹配')
    return ad
  }

  async searchAds(
    credentials: BinanceCredentials,
    query: C2cAdMarketQuery,
  ): Promise<C2cAdMarketSnapshot> {
    const baseUrl = credentials.baseUrl ?? 'https://api.binance.com'
    const marketOrigin =
      new URL(baseUrl).origin === 'https://api.binance.com' ? 'https://p2p.binance.com' : baseUrl
    const response = await this.http.request<
      BinanceEnvelope<
        Array<{
          adv: Record<string, unknown>
          advertiser: Record<string, unknown>
        }>
      >
    >({
      method: 'POST',
      url: `${marketOrigin.replace(/\/$/, '')}/bapi/c2c/v2/friendly/c2c/adv/search`,
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: credentials.timeoutMs,
      ...(credentials.proxyScope ? { proxyScope: credentials.proxyScope } : {}),
      body: {
        fiat: query.fiatCurrency,
        page: 1,
        rows: query.limit,
        tradeType: query.side === 'BUY' ? 'SELL' : 'BUY',
        asset: query.asset,
        countries: [],
        filterType: 'all',
        periods: query.periodMinutes === null ? [] : [String(query.periodMinutes)],
        transAmount: query.amount,
        payTypes: query.paymentMethods,
        publisherType: query.merchantOnly ? 'merchant' : null,
      },
    })
    if (!response.success || response.code !== '000000') {
      throw new C2cRequestRejectedError('币安广告行情请求被拒绝', response.code)
    }
    return {
      quotes: response.data.map((item) => normalizeBinanceMarketQuote(item, query.side)),
      fetchedAt: new Date().toISOString(),
      window: { page: 1, rows: query.limit },
    }
  }

  async updateAdPrice(credentials: BinanceCredentials, platformAdId: string, price: string) {
    const response = await this.post<boolean>(credentials, '/sapi/v1/c2c/ads/update', {
      advNo: platformAdId,
      price,
    })
    if (response.data === false)
      throw new C2cRequestRejectedError('币安广告改价未成功', 'AD_UPDATE_REJECTED')
    return { platformAdId }
  }

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
      rawItemCount: response.data.length,
      rawOrderIds: response.data.map((item) => String(item.orderNumber ?? '')),
      hasMore:
        response.data.length > 0 &&
        (hasUpstreamTotal ? input.page * input.rows < total : response.data.length === input.rows),
    }
  }

  async getOrderDetail(credentials: BinanceCredentials, orderNumber: string) {
    const response = await this.getOrderDetailRaw(credentials, orderNumber)
    return normalizeBinanceDetail(response.data, orderNumber)
  }

  getOrderDetailRaw(credentials: BinanceCredentials, orderNumber: string) {
    return this.post<Record<string, unknown>>(
      credentials,
      '/sapi/v1/c2c/orderMatch/getUserOrderDetail',
      { adOrderNo: orderNumber },
    )
  }

  async listReportOrders(credentials: BinanceCredentials, input: C2cReportInput) {
    const response = await this.getList<Record<string, unknown>[]>(
      credentials,
      '/sapi/v1/c2c/orderMatch/listUserOrderHistory',
      {
        startTimestamp: String(input.startTimestamp),
        endTimestamp: String(input.endTimestamp),
        page: String(input.page),
        rows: String(input.rows),
        tradeType: input.tradeType,
      },
    )
    const hasUpstreamTotal = response.total !== undefined && Number.isFinite(Number(response.total))
    const total = hasUpstreamTotal ? Number(response.total) : response.data.length
    return {
      items: response.data
        .filter((item) => String(item.tradeType).toUpperCase() === 'BUY')
        .map(normalizeBinanceReportSummary),
      total,
      rawItemCount: response.data.length,
      rawOrderIds: response.data.map((item) => String(item.orderNumber ?? '')),
      hasMore:
        response.data.length > 0 &&
        (hasUpstreamTotal ? input.page * input.rows < total : response.data.length === input.rows),
    }
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
    const proxyAgents = credentials.proxyScope
      ? await this.network.forMerchant(credentials.proxyScope)
      : null
    const url = `${chat.chatWssUrl.replace(/\/+$/, '')}/${encodeURIComponent(chat.listenKey)}?token=${encodeURIComponent(chat.listenToken)}&clientType=web`
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new Ws(url, {
          ...(proxyAgents
            ? { agent: url.startsWith('wss:') ? proxyAgents.httpsAgent : proxyAgents.httpAgent }
            : {}),
        })
        const timer = setTimeout(() => {
          socket.terminate()
          reject(new Error('币安 C2C 聊天发送超时'))
        }, credentials.timeoutMs)
        timer.unref()
        socket.once('open', () => {
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
            (error) => {
              clearTimeout(timer)
              socket.close()
              if (error) reject(new Error('币安 C2C 聊天发送失败'))
              else resolve()
            },
          )
        })
        socket.once('error', () => {
          clearTimeout(timer)
          socket.terminate()
          reject(new Error('币安 C2C 聊天连接失败'))
        })
        socket.once('close', () => {
          clearTimeout(timer)
          reject(new Error('币安 C2C 聊天连接已关闭'))
        })
      })
    } finally {
      proxyAgents?.destroy()
    }
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

  uploadComplaintFile(credentials: BinanceCredentials, uploadUrl: string, content: Buffer) {
    return this.http.request<unknown>({
      method: 'PUT',
      url: uploadUrl,
      headers: { 'Content-Type': 'application/octet-stream' },
      timeoutMs: 30_000,
      ...(credentials.proxyScope ? { proxyScope: credentials.proxyScope } : {}),
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
      listReportOrders: true,
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

  private async getList<T>(
    credentials: BinanceCredentials,
    path: string,
    params: Record<string, string>,
  ) {
    return this.request<BinanceListEnvelope<T>>(credentials, path, undefined, 'GET', params)
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
      ...(credentials.proxyScope ? { proxyScope: credentials.proxyScope } : {}),
      body,
    })
    if ((!response.success || response.code !== '000000') && path.startsWith('/sapi/v1/c2c/ads/')) {
      throw new C2cRequestRejectedError('币安广告请求被拒绝', response.code)
    }
    if (!response.success || response.code !== '000000')
      throw new Error(`[${response.code}] ${response.message ?? '币安 C2C 请求失败'}`)
    return response
  }
}
