import { Inject, Injectable, Logger } from '@nestjs/common'
import { createPrivateKey, sign } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import {
  C2C_HTTP_TRANSPORT,
  type C2cCapabilities,
  type C2cComplaintPayload,
  type C2cComplaintSubmissionResult,
  type C2cHttpTransport,
  type C2cListInput,
  type C2cMarkPaidOptions,
  type C2cMarkPaidPolicy,
  type C2cPaymentProofImage,
  type C2cPlatformAdapter,
  type C2cReportInput,
  C2cCredentialRejectedError,
  C2cRequestRejectedError,
} from './c2c-platform.types'
import {
  normalizeOkxDetail,
  normalizeOkxSummary,
  normalizeOkxReportSummary,
} from './c2c-order-normalizer'
import type { C2cAdMarketQuery, C2cAdMarketSnapshot } from './c2c-ad.types'
import { adId, adText, normalizeOkxAd, normalizeOkxMarketQuote } from './c2c-ad-normalizer'

export interface OkxWebPrivateCredentials {
  proxyScope?: { tenantId: string; merchantId: string }
  cookie: string
  authorization: string
  signaturePrivateKey?: string
  skipPaymentProofUpload?: boolean
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

interface OkxOrderListData {
  items?: Record<string, unknown>[]
  orders?: Record<string, unknown>[]
  total?: number
  totalItemCount?: number
  pageInfo?: {
    pageCount?: number
    pageIndex?: number
    pageSize?: number
    totalItemCount?: number
  }
}

@Injectable()
export class OkxWebPrivateClient implements C2cPlatformAdapter<OkxWebPrivateCredentials> {
  private readonly logger = new Logger(OkxWebPrivateClient.name)
  constructor(@Inject(C2C_HTTP_TRANSPORT) private readonly http: C2cHttpTransport) {}

  async listAds(credentials: OkxWebPrivateCredentials) {
    return (await this.listAdRecords(credentials)).map(normalizeOkxAd)
  }

  async getAd(credentials: OkxWebPrivateCredentials, platformAdId: string) {
    return normalizeOkxAd(await this.getAdRecord(credentials, platformAdId))
  }

  async searchAds(
    credentials: OkxWebPrivateCredentials,
    query: C2cAdMarketQuery,
  ): Promise<C2cAdMarketSnapshot> {
    if (query.periodMinutes !== null)
      throw new C2cRequestRejectedError('欧易广告行情不支持付款时限筛选', 'UNSUPPORTED_AD_PERIOD')
    const side = query.side.toLowerCase()
    const response = await this.get<Record<string, Record<string, unknown>[]>>(
      credentials,
      '/v3/c2c/tradingOrders/getMarketplaceAdsPrelogin',
      {
        side,
        paymentMethod: 'all',
        userType: query.merchantOnly ? 'certified' : 'all',
        hideOverseasVerificationAds: 'false',
        sortType: query.side === 'BUY' ? 'price_desc' : 'price_asc',
        limit: '100',
        cryptoCurrency: query.asset.toLowerCase(),
        fiatCurrency: query.fiatCurrency.toLowerCase(),
        currentPage: '1',
        numberPerPage: '100',
        ...(query.amount !== '0' ? { quoteMinAmountPerOrder: query.amount } : {}),
        t: String(Date.now()),
      },
    )
    const quotes = response.data?.[side]
    if (!Array.isArray(quotes)) throw new Error('欧易广告行情返回无效')
    return {
      quotes: quotes.map((raw) =>
        normalizeOkxMarketQuote(raw, query.side, query.asset, query.fiatCurrency),
      ),
      fetchedAt: new Date().toISOString(),
      window: { page: 1, rows: 100 },
    }
  }

  async updateAdPrice(credentials: OkxWebPrivateCredentials, platformAdId: string, price: string) {
    const body = await this.prepareAdPriceUpdate(credentials, platformAdId, price)
    const response = await this.post<{ publicId?: string }>(
      credentials,
      '/v3/c2c/tradingOrders/modify',
      body,
      { t: String(Date.now()) },
    )
    return { platformAdId: adId(response.data?.publicId, 'publicId') }
  }

  async listOrders(credentials: OkxWebPrivateCredentials, input: C2cListInput) {
    if (input.tradeType !== 'BUY') throw new Error('欧易 C2C 仅支持 BUY 买币订单')
    const timestamp = Date.now()
    const response = await this.get<Record<string, unknown>[] | OkxOrderListData>(
      credentials,
      '/v4/c2c/order/getOrderList',
      {
        orderType: 'pending',
        startTime: String(input.startDate),
        endTime: String(input.endDate),
        pageSize: String(input.rows),
        pageIndex: String(input.page),
        t: String(timestamp),
      },
      {
        Referer: `${(credentials.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '')}/p2p/orders-new`,
        'x-request-timestamp': String(timestamp),
      },
    )
    const data = response.data
    const rawItems = Array.isArray(data) ? data : (data?.items ?? data?.orders ?? [])
    const items = rawItems
      .filter((item) => String(item.side).toLowerCase() === 'buy')
      .map(input.orderStatusList.length ? normalizeOkxSummary : normalizeOkxReportSummary)
      .filter(
        (item) =>
          !input.orderStatusList.length ||
          input.orderStatusList.includes(this.toNumericStatus(item.status)),
      )
    const upstreamTotal = Array.isArray(data)
      ? undefined
      : (data?.total ?? data?.totalItemCount ?? data?.pageInfo?.totalItemCount)
    const hasUpstreamTotal = upstreamTotal !== undefined && Number.isFinite(Number(upstreamTotal))
    const total = hasUpstreamTotal ? Number(upstreamTotal) : rawItems.length
    return {
      items,
      total,
      rawItemCount: rawItems.length,
      rawOrderIds: rawItems.map((item) => String(item.id ?? '')),
      hasMore:
        rawItems.length > 0 &&
        (hasUpstreamTotal ? input.page * input.rows < total : rawItems.length === input.rows),
    }
  }

  async listReportOrders(credentials: OkxWebPrivateCredentials, input: C2cReportInput) {
    const timestamp = Date.now()
    const response = await this.get<Record<string, unknown>[] | OkxOrderListData>(
      credentials,
      '/v4/c2c/order/getOrderList',
      {
        orderType: 'completed',
        startTime: String(input.startTimestamp),
        endTime: String(input.endTimestamp),
        isBuy: 'true',
        pageSize: String(input.rows),
        pageIndex: String(input.page),
        t: String(timestamp),
      },
      {
        Referer: `${(credentials.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '')}/p2p/orders-new`,
        'x-request-timestamp': String(timestamp),
      },
    )
    const data = response.data
    const rawItems = Array.isArray(data) ? data : (data?.items ?? data?.orders ?? [])
    const items = rawItems
      .filter((item) => String(item.side).toLowerCase() === 'buy')
      .map(normalizeOkxReportSummary)
    const upstreamTotal = Array.isArray(data)
      ? undefined
      : (data?.total ?? data?.totalItemCount ?? data?.pageInfo?.totalItemCount)
    const hasUpstreamTotal = upstreamTotal !== undefined && Number.isFinite(Number(upstreamTotal))
    const total = hasUpstreamTotal ? Number(upstreamTotal) : rawItems.length
    return {
      items,
      total,
      rawItemCount: rawItems.length,
      rawOrderIds: rawItems.map((item) => String(item.id ?? '')),
      hasMore:
        rawItems.length > 0 &&
        (hasUpstreamTotal ? input.page * input.rows < total : rawItems.length === input.rows),
    }
  }

  async getOrderDetail(credentials: OkxWebPrivateCredentials, orderId: string) {
    const response = await this.getOrderDetailRaw(credentials, orderId)
    if (!response.data) throw new Error(response.msg ?? '欧易 C2C 订单详情无效')
    return normalizeOkxDetail(response.data, orderId)
  }

  async getOrderDetailRaw(credentials: OkxWebPrivateCredentials, orderId: string) {
    const response = await this.get<Record<string, unknown>>(
      credentials,
      `/v3/c2c/orders/${this.orderId(orderId)}`,
      {},
    )
    return response
  }

  async checkAntiFraud(credentials: OkxWebPrivateCredentials, orderId: string, fiat: string) {
    const timestamp = Date.now()
    const response = await this.get<{ shouldShowPopup?: boolean; isShowPopup?: boolean }>(
      credentials,
      '/v4/c2c/risk/antiFraudPopup/info',
      {
        fiatCurrency: fiat,
        publicOrderId: this.orderId(orderId),
        eventType: '4',
        t: String(timestamp),
      },
      {
        Referer: this.orderReferer(credentials, orderId),
        'x-request-timestamp': String(timestamp),
      },
    )
    return {
      riskReviewRequired: Boolean(response.data?.shouldShowPopup || response.data?.isShowPopup),
    }
  }

  async markOrderAsPaid(
    credentials: OkxWebPrivateCredentials,
    orderId: string,
    paymentAccountId: number | string,
    options?: C2cMarkPaidOptions,
  ) {
    const paymentAccountIdText = String(paymentAccountId)
    if (!/^\d+$/.test(paymentAccountIdText) || BigInt(paymentAccountIdText) <= 0n)
      throw new Error('欧易 C2C receiptAccountId 无效')
    const signingKey = this.parseSigningKey(credentials)
    const images = options?.paymentProofImages ?? []
    if (!options?.skipPaymentProofUpload && !images.length)
      throw new Error('欧易 C2C 付款凭证图片不能为空')
    const paymentProofFileUrls = options?.skipPaymentProofUpload
      ? undefined
      : await Promise.all(
          images.map((image) => this.uploadPaymentProof(credentials, orderId, image)),
        )
    let risk: { riskReviewRequired: boolean } | undefined
    try {
      risk = await this.checkAntiFraud(credentials, orderId, options?.fiat ?? 'CNY')
    } catch (error) {
      this.logger.warn(
        `欧易 C2C 反欺诈检查异常，继续标记付款: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (risk?.riskReviewRequired) throw new Error('欧易反欺诈检查要求人工复核')
    const path = `/v3/c2c/orders/${this.orderId(orderId)}/payment/paid`
    const timestamp = Date.now()
    const body = paymentProofFileUrls
      ? `{"receiptAccountId":${paymentAccountIdText},"paymentProofFileUrls":${JSON.stringify(paymentProofFileUrls)}}`
      : `{"receiptAccountId":${paymentAccountIdText}}`
    const response = await this.post<Record<string, never>>(
      credentials,
      path,
      body,
      { t: String(timestamp) },
      {
        Referer: this.orderReferer(credentials, orderId),
        'x-request-timestamp': String(timestamp),
        'x-client-signature-version': '1.3',
        'x-client-signature': this.createClientSignature(signingKey, path, body, timestamp),
      },
    )
    return { supported: true, ...(response.requestId ? { requestId: response.requestId } : {}) }
  }

  getComplaintReasons() {
    return [{ reasonCode: 1, reasonDesc: '已付款，催促卖家放币' }]
  }

  async uploadComplaintFile(
    credentials: OkxWebPrivateCredentials,
    orderId: string,
    image: C2cPaymentProofImage,
  ): Promise<string> {
    if (image.imageType !== 'jpeg') throw new Error('欧易申诉回单仅支持 JPG 格式')
    const path = '/v3/c2c/files/'
    const timestamp = Date.now()
    const signingKey = this.parseSigningKey(credentials)
    const form = new FormData()
    form.append(
      'file',
      new Blob([new Uint8Array(image.content)], { type: 'image/jpeg' }),
      image.fileName || 'receipt.jpg',
    )
    const response = await this.request<{ imgPath?: string }>(
      credentials,
      'POST',
      path,
      { type: 'reminder', t: String(timestamp) },
      form,
      {
        Referer: this.orderReferer(credentials, orderId),
        'x-request-timestamp': String(timestamp),
        'x-client-signature-version': '1.3',
        'x-client-signature': this.createClientSignature(signingKey, path, '', timestamp),
      },
    )
    const imageUrl = response.data?.imgPath?.trim()
    if (!imageUrl) throw new Error('欧易申诉回单上传未返回图片地址')
    return imageUrl
  }

  async submitComplaint(
    credentials: OkxWebPrivateCredentials,
    payload: C2cComplaintPayload,
  ): Promise<C2cComplaintSubmissionResult> {
    if (payload.fileUrls.length !== 1 || !payload.fileUrls[0]?.trim()) {
      throw new Error('欧易申诉必须且只能提交一张 JPG 回单')
    }
    const path = '/v3/c2c/appeal/appealUrge'
    const timestamp = Date.now()
    const signingKey = this.parseSigningKey(credentials)
    const orderId = this.numericOrderId(payload.orderNo)
    const body = `{"publicOrderId":${orderId},"imageUrls":${JSON.stringify(payload.fileUrls[0].trim())}}`
    const response = await this.post<Record<string, never>>(
      credentials,
      path,
      body,
      { t: String(timestamp) },
      {
        Referer: this.orderReferer(credentials, orderId),
        'x-request-timestamp': String(timestamp),
        'x-client-signature-version': '1.3',
        'x-client-signature': this.createClientSignature(signingKey, path, body, timestamp),
      },
    )
    const requestId = response.requestId?.trim()
    if (!requestId) throw new Error('欧易申诉提交未返回请求编号')
    return { data: { complaintNo: requestId } }
  }

  sendChatText(
    _credentials: OkxWebPrivateCredentials,
    _orderId: string,
    _content: string,
  ): Promise<never> {
    return Promise.reject(new Error('欧易不支持 C2C 聊天'))
  }

  getCapabilities(): C2cCapabilities {
    return {
      appeal: true,
      cancelOrder: false,
      chat: false,
      checkAntiFraud: true,
      listOrders: true,
      listReportOrders: true,
      getOrderDetail: true,
      markOrderAsPaid: true,
      releaseCrypto: false,
      sellOrders: false,
    }
  }

  getMarkPaidPolicy(credentials: OkxWebPrivateCredentials): C2cMarkPaidPolicy {
    return {
      paymentProof: credentials.skipPaymentProofUpload === false ? 'REQUIRED' : 'SKIP',
    }
  }

  private async prepareAdPriceUpdate(
    credentials: OkxWebPrivateCredentials,
    platformAdId: string,
    price: string,
  ) {
    try {
      const current = await this.getAdRecord(credentials, platformAdId)
      if (current.type !== 'limit')
        throw new C2cRequestRejectedError('欧易仅支持固定价格广告调价', 'UNSUPPORTED_AD_TYPE')
      const accountVos = current.accountVos as Array<{
        receiptDetailVos: Array<{ receiptAccountId: unknown }>
      }>
      const receiptIds = accountVos.flatMap((account) =>
        account.receiptDetailVos.map((detail) => adId(detail.receiptAccountId, 'receiptAccountId')),
      )
      if (!receiptIds.length) throw new Error('欧易广告未返回收款方式编号')
      return {
        publicId: platformAdId,
        price,
        type: current.type,
        baseAmount: adText(current.availableAmount, 'availableAmount'),
        receiptIds: receiptIds.join(' '),
        ...(typeof current.online === 'boolean' ? { online: current.online } : {}),
        ...(typeof current.enterMarket === 'boolean' ? { enterMarket: current.enterMarket } : {}),
      }
    } catch (error) {
      if (error instanceof C2cCredentialRejectedError || error instanceof C2cRequestRejectedError)
        throw error
      throw new C2cRequestRejectedError(
        '欧易广告改价准备失败，本次未提交',
        'AD_UPDATE_NOT_SUBMITTED',
      )
    }
  }

  private async listAdRecords(credentials: OkxWebPrivateCredentials) {
    const ads: Record<string, unknown>[] = []
    const pagesize = 100
    for (let page = 1; ; page += 1) {
      const response = await this.get<{ current?: { items?: Record<string, unknown>[] } }>(
        credentials,
        '/v3/c2c/tradingOrders/getMyAds',
        { page: String(page), pagesize: String(pagesize), t: String(Date.now()) },
      )
      const items = response.data?.current?.items
      if (!Array.isArray(items)) throw new Error('欧易广告列表返回无效')
      ads.push(...items)
      if (items.length < pagesize) return ads
    }
  }

  private async getAdRecord(credentials: OkxWebPrivateCredentials, platformAdId: string) {
    const ad = (await this.listAdRecords(credentials)).find(
      (item) => adId(item.publicId, 'publicId') === platformAdId,
    )
    if (!ad) throw new Error('欧易广告不存在')
    return ad
  }

  private get<T>(
    credentials: OkxWebPrivateCredentials,
    path: string,
    params: Record<string, string>,
    headers?: Record<string, string>,
  ) {
    return this.request<T>(credentials, 'GET', path, params, undefined, headers)
  }

  private post<T>(
    credentials: OkxWebPrivateCredentials,
    path: string,
    body: unknown,
    params: Record<string, string>,
    headers?: Record<string, string>,
  ) {
    return this.request<T>(credentials, 'POST', path, params, body, headers)
  }

  private async request<T>(
    credentials: OkxWebPrivateCredentials,
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ) {
    let response: OkxEnvelope<T>
    try {
      response = await this.http.request<OkxEnvelope<T>>({
        method,
        url: `${(credentials.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '')}${path}`,
        params,
        body,
        timeoutMs: credentials.timeoutMs,
        ...(credentials.proxyScope ? { proxyScope: credentials.proxyScope } : {}),
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
          'App-Type': 'web',
          ...(!(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          Cookie: credentials.cookie,
          Authorization: credentials.authorization,
          ...extraHeaders,
        },
      })
    } catch (error) {
      const credentialError = this.credentialErrorFromFailure(error)
      if (credentialError) throw credentialError
      throw error
    }
    const code = String(response.code ?? response.error_code ?? '')
    if (['401', '403', '800', '805'].includes(code))
      throw new C2cCredentialRejectedError(`欧易 Web 凭据失效 [${code}]`, code)
    if (code !== '0' && path.startsWith('/v3/c2c/tradingOrders/')) {
      throw new C2cRequestRejectedError('欧易广告请求被拒绝', code)
    }
    if (code !== '0') throw new Error(response.msg ?? response.error_message ?? '欧易 C2C 请求失败')
    return response
  }

  private credentialErrorFromFailure(error: unknown): C2cCredentialRejectedError | null {
    const status = (error as { response?: { status?: number } })?.response?.status
    const responseData = (error as { response?: { data?: OkxEnvelope<unknown> } })?.response?.data
    const responseCode = String(responseData?.code ?? responseData?.error_code ?? '')
    if (status !== 401 && status !== 403 && !['401', '403', '800', '805'].includes(responseCode)) {
      return null
    }
    const code = responseCode || String(status)
    return new C2cCredentialRejectedError(`欧易 Web 凭据失效 [${code}]`, responseCode, status)
  }

  private async uploadPaymentProof(
    credentials: OkxWebPrivateCredentials,
    orderId: string,
    image: C2cPaymentProofImage,
  ) {
    const form = new FormData()
    const mime =
      image.imageType === 'png'
        ? 'image/png'
        : image.imageType === 'webp'
          ? 'image/webp'
          : 'image/jpeg'
    form.append(
      'file',
      new Blob([new Uint8Array(image.content)], { type: mime }),
      image.fileName || 'receipt.jpg',
    )
    const response = await this.request<{ imgPath?: string }>(
      credentials,
      'POST',
      '/v3/c2c/files/',
      { type: 'paymentProof', t: String(Date.now()) },
      form,
      { Referer: this.orderReferer(credentials, orderId) },
    )
    const imgPath = response.data?.imgPath?.trim()
    if (!imgPath)
      throw new Error(response.msg || response.error_message || '欧易 C2C 付款凭证上传失败')
    return imgPath
  }

  private parseSigningKey(credentials: OkxWebPrivateCredentials): KeyObject {
    if (!credentials.signaturePrivateKey) throw new Error('欧易 C2C 签名私钥未配置')
    try {
      const key = createPrivateKey({
        key: Buffer.from(credentials.signaturePrivateKey, 'base64'),
        format: 'der',
        type: 'pkcs8',
      })
      if (key.asymmetricKeyType !== 'ec') throw new Error('not EC')
      return key
    } catch {
      throw new Error('欧易 C2C 签名私钥格式无效，应填写 PKCS#8 Base64')
    }
  }

  private createClientSignature(key: KeyObject, path: string, body: string, timestamp: number) {
    const signature = sign('sha256', Buffer.from(`${path}${body}${timestamp}`, 'utf8'), {
      key,
      dsaEncoding: 'ieee-p1363',
    })
    return `{P1363}${signature.toString('base64')}`
  }

  private orderReferer(credentials: OkxWebPrivateCredentials, orderId: string) {
    return `${(credentials.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '')}/p2p/order?orderId=${encodeURIComponent(orderId)}`
  }

  private orderId(value: string) {
    const orderId = value.trim()
    if (!orderId) throw new Error('欧易 C2C 订单 ID 为空')
    return encodeURIComponent(orderId)
  }

  private numericOrderId(value: string) {
    const orderId = value.trim()
    if (!/^\d+$/.test(orderId) || BigInt(orderId) <= 0n) {
      throw new Error('欧易 C2C 订单 ID 无效')
    }
    return orderId
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
