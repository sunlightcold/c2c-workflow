import { Inject, Injectable } from '@nestjs/common'
import {
  C2C_HTTP_TRANSPORT,
  type C2cCapabilities,
  type C2cHttpTransport,
  type C2cListInput,
} from './c2c-platform.types'
import { normalizeOkxDetail, normalizeOkxSummary } from './c2c-order-normalizer'

export interface OkxWebPrivateCredentials {
  cookie: string
  authorization: string
  baseUrl?: string
  timeoutMs: number
}

interface OkxEnvelope<T> {
  code?: string | number
  data?: T
  msg?: string
  error_code?: string
  error_message?: string
  requestId?: string
}

@Injectable()
export class OkxWebPrivateClient {
  constructor(@Inject(C2C_HTTP_TRANSPORT) private readonly http: C2cHttpTransport) {}

  async listOrders(credentials: OkxWebPrivateCredentials, input: C2cListInput) {
    if (input.tradeType !== 'BUY') throw new Error('欧易 C2C 仅支持 BUY 买币订单')
    const response = await this.get<
      | Record<string, unknown>[]
      | { items?: Record<string, unknown>[]; orders?: Record<string, unknown>[]; total?: number }
    >(credentials, '/v4/c2c/order/getOrderList', {
      orderType: 'pending',
      startTime: String(input.startDate),
      endTime: String(input.endDate),
      isBuy: 'true',
      pageSize: String(input.rows),
      pageIndex: String(input.page),
      t: String(Date.now()),
    })
    const data = response.data
    const rawItems = Array.isArray(data) ? data : (data?.items ?? data?.orders ?? [])
    const items = rawItems
      .filter((item) => String(item.side ?? 'buy').toLowerCase() === 'buy')
      .map(normalizeOkxSummary)
      .filter(
        (item) =>
          !input.orderStatusList.length ||
          input.orderStatusList.includes(this.toNumericStatus(item.status)),
      )
    return {
      items,
      total: Array.isArray(data) ? items.length : Number(data?.total ?? items.length),
    }
  }

  async getOrderDetail(credentials: OkxWebPrivateCredentials, orderId: string) {
    const response = await this.get<Record<string, unknown>>(
      credentials,
      `/v3/c2c/orders/${this.orderId(orderId)}`,
      { t: String(Date.now()) },
    )
    if (!response.data) throw new Error(response.msg ?? '欧易 C2C 订单详情无效')
    return normalizeOkxDetail(response.data, orderId)
  }

  async checkAntiFraud(credentials: OkxWebPrivateCredentials, orderId: string, fiat: string) {
    const response = await this.get<{ shouldShowPopup?: boolean; isShowPopup?: boolean }>(
      credentials,
      '/v4/c2c/risk/antiFraudPopup/info',
      {
        fiatCurrency: fiat,
        publicOrderId: this.orderId(orderId),
        eventType: '4',
        t: String(Date.now()),
      },
    )
    return {
      riskReviewRequired: Boolean(response.data?.shouldShowPopup || response.data?.isShowPopup),
    }
  }

  async markOrderAsPaid(
    credentials: OkxWebPrivateCredentials,
    orderId: string,
    paymentAccountId: string,
  ) {
    if (!/^\d+$/.test(paymentAccountId) || BigInt(paymentAccountId) <= 0n)
      throw new Error('欧易 C2C receiptAccountId 无效')
    const id = BigInt(paymentAccountId)
    return this.post(
      credentials,
      `/v3/c2c/orders/${this.orderId(orderId)}/payment/paid`,
      { receiptAccountId: id <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : paymentAccountId },
      { t: String(Date.now()) },
    )
  }

  getCapabilities(): C2cCapabilities {
    return { listOrders: true, getOrderDetail: true, markOrderAsPaid: true, sellOrders: false }
  }

  private get<T>(
    credentials: OkxWebPrivateCredentials,
    path: string,
    params: Record<string, string>,
  ) {
    return this.request<T>(credentials, 'GET', path, params)
  }

  private post<T>(
    credentials: OkxWebPrivateCredentials,
    path: string,
    body: unknown,
    params: Record<string, string>,
  ) {
    return this.request<T>(credentials, 'POST', path, params, body)
  }

  private async request<T>(
    credentials: OkxWebPrivateCredentials,
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    body?: unknown,
  ) {
    const response = await this.http.request<OkxEnvelope<T>>({
      method,
      url: `${(credentials.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '')}${path}`,
      params,
      body,
      timeoutMs: credentials.timeoutMs,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: credentials.cookie,
        Authorization: credentials.authorization,
      },
    })
    const code = String(response.code ?? response.error_code ?? '')
    if (['401', '403', '800', '805'].includes(code)) throw new Error(`欧易 Web 凭据失效 [${code}]`)
    if (code !== '0') throw new Error(response.msg ?? response.error_message ?? '欧易 C2C 请求失败')
    return response
  }

  private orderId(value: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('欧易 C2C 订单 ID 无效')
    return encodeURIComponent(value)
  }

  private toNumericStatus(status: string) {
    const values: Record<string, number> = {
      PENDING_PAYMENT: 1,
      PAID: 2,
      DISPUTED: 3,
      COMPLETED: 4,
      CANCELLED: 6,
      EXPIRED: 7,
    }
    return values[status] ?? -1
  }
}
