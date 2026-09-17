import { verify } from 'node:crypto'
import type { OkxC2cMockOrder, OkxC2cSettings } from './types'

interface OkxRequest {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown>
  headers: Headers
}

function errorResponse(code: string, message: string, status = 400) {
  return {
    status,
    body: {
      code,
      error_code: code,
      msg: message,
      error_message: message,
      detailMsg: message,
      data: null,
    },
  }
}

function required(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}不能为空`)
  return value.trim()
}

export class OkxC2cMockPlugin {
  readonly id = 'okx-c2c'

  constructor(
    private readonly getSettings: () => OkxC2cSettings,
    private readonly list: () => OkxC2cMockOrder[],
    private readonly find: (id: string) => OkxC2cMockOrder | undefined,
    private readonly update: (
      id: string,
      updater: (order: OkxC2cMockOrder) => OkxC2cMockOrder,
    ) => OkxC2cMockOrder | undefined,
  ) {}

  handle(request: OkxRequest) {
    try {
      this.verify(request)
      if (request.method === 'GET' && request.path === '/v4/c2c/order/getOrderList')
        return this.listOrders(request.query)
      if (request.method === 'GET' && request.path === '/v4/c2c/risk/antiFraudPopup/info')
        return this.antiFraud()
      if (request.method === 'POST' && request.path === '/v3/c2c/files/')
        return this.uploadFile(request)
      if (request.method === 'POST' && request.path === '/v3/c2c/appeal/appealUrge')
        return this.submitAppeal(request)
      if (request.method === 'GET' && request.path.startsWith('/v3/c2c/orders/'))
        return this.detail(request.path)
      if (request.method === 'POST' && request.path.endsWith('/payment/paid'))
        return this.markOrderAsPaid(request)
      return errorResponse('404', '接口不存在', 404)
    } catch (error) {
      return errorResponse('400001', (error as Error).message)
    }
  }

  private verify(request: OkxRequest) {
    const settings = this.getSettings()
    if (request.headers.get('authorization') !== settings.authorization)
      throw new Error('Authorization不匹配')
    if (request.headers.get('cookie') !== settings.cookie) throw new Error('Cookie不匹配')
  }

  private listOrders(query: Record<string, string>) {
    if (query.orderType !== 'pending')
      return { status: 200, body: { code: 0, data: { total: 0, items: [] } } }
    const start = Number(query.startTime)
    const end = Number(query.endTime)
    const orders = this.list().filter(
      (order) =>
        order.side === 'buy' &&
        order.orderStatus === 'new' &&
        order.orderProcessStatus === 2 &&
        order.paymentStatus === 'unpaid' &&
        (!Number.isFinite(start) || order.createdDate >= start) &&
        (!Number.isFinite(end) || order.createdDate <= end),
    )
    const pageSize = Math.max(1, Number(query.pageSize) || 10)
    const pageIndex = Math.max(1, Number(query.pageIndex) || 1)
    const offset = (pageIndex - 1) * pageSize
    return {
      status: 200,
      body: {
        code: 0,
        data: {
          total: orders.length,
          items: orders.slice(offset, offset + pageSize).map((order) => this.listItem(order)),
        },
      },
    }
  }

  private detail(path: string) {
    const id = required(path.slice('/v3/c2c/orders/'.length), 'orderId')
    const order = this.find(id)
    if (!order) return errorResponse('400404', '订单不存在', 404)
    return { status: 200, body: { code: 0, data: this.detailItem(order) } }
  }

  private antiFraud() {
    const review = this.getSettings().antiFraudReview
    return {
      status: 200,
      body: {
        code: 0,
        data: { delaySeconds: 0, isShowPopup: review, shouldShowPopup: review, popupContent: [] },
        requestId: 'mock-risk-request',
      },
    }
  }

  private uploadFile(request: OkxRequest) {
    if (!['paymentProof', 'reminder'].includes(request.query.type))
      return errorResponse('400006', '上传类型不匹配')
    const file = request.body.file as
      | { filename?: string; type?: string; size?: number }
      | undefined
    if (!file || !file.filename || !file.size || file.size <= 0)
      return errorResponse('400012', '付款凭证文件不能为空')
    const acceptedTypes =
      request.query.type === 'reminder' ? ['image/jpeg'] : ['image/jpeg', 'image/png', 'image/webp']
    if (!acceptedTypes.includes(file.type ?? ''))
      return errorResponse('400013', '付款凭证文件格式不支持')
    if (request.query.type === 'reminder') {
      const signatureError = this.verifyClientSignature(request, '')
      if (signatureError) return signatureError
      return {
        status: 200,
        body: {
          code: 0,
          data: { imgPath: 'https://mock.okx.test/c2c/reminder/receipt.jpg' },
          requestId: 'mock-appeal-upload-request',
        },
      }
    }
    return { status: 200, body: { code: 0, data: { imgPath: '/mock/payment-proof/receipt.jpg' } } }
  }

  private submitAppeal(request: OkxRequest) {
    const signatureError = this.verifyClientSignature(request, JSON.stringify(request.body))
    if (signatureError) return signatureError
    const id = required(String(request.body.publicOrderId ?? ''), 'publicOrderId')
    const imageUrl = required(request.body.imageUrls, 'imageUrls')
    if (imageUrl !== 'https://mock.okx.test/c2c/reminder/receipt.jpg') {
      return errorResponse('400014', '申诉回单地址不匹配')
    }
    const order = this.find(id)
    if (!order) return errorResponse('400404', '订单不存在', 404)
    if (order.paymentStatus !== 'paid') return errorResponse('400015', '订单尚未付款')
    const now = Date.now()
    const updated = this.update(id, (current) => ({
      ...current,
      orderStatus: 'appeal',
      orderProcessStatus: 3,
      modifyDate: now,
    }))
    if (!updated) return errorResponse('400404', '订单不存在', 404)
    return { status: 200, body: { code: 0, data: {}, requestId: 'mock-appeal-request' } }
  }

  private markOrderAsPaid(request: OkxRequest) {
    if (this.getSettings().markOrderAsPaidFailure)
      return errorResponse('400003', '模拟确认付款失败')
    const marker = '/v3/c2c/orders/'
    const id = required(
      request.path.slice(marker.length, request.path.indexOf('/payment/paid')),
      'orderId',
    )
    const order = this.find(id)
    if (!order) return errorResponse('400404', '订单不存在', 404)
    const signatureError = this.verifyClientSignature(request, JSON.stringify(request.body))
    if (signatureError) return signatureError
    if (String(request.body.receiptAccountId) !== order.receiptAccountId)
      return errorResponse('400004', 'receiptAccountId不匹配')
    const proofUrls = request.body.paymentProofFileUrls
    if (
      proofUrls !== undefined &&
      (!Array.isArray(proofUrls) ||
        proofUrls.length !== 1 ||
        proofUrls[0] !== '/mock/payment-proof/receipt.jpg')
    )
      return errorResponse('400010', 'paymentProofFileUrls不匹配')
    if (order.orderStatus !== 'new' || order.paymentStatus !== 'unpaid')
      return errorResponse('400005', '当前订单状态不允许标记付款')
    const now = Date.now()
    const updated = this.update(id, (current) => ({
      ...current,
      orderStatus: 'new',
      orderProcessStatus: 2,
      paymentStatus: 'paid',
      orderPaidDate: now,
      modifyDate: now,
    }))
    if (!updated) return errorResponse('400404', '订单不存在', 404)
    return { status: 200, body: { code: 0, data: {}, requestId: 'mock-paid-request' } }
  }

  private verifyClientSignature(request: OkxRequest, body: string) {
    if (!request.headers.get('x-request-timestamp'))
      return errorResponse('400007', '缺少签名时间戳')
    if (!request.headers.get('x-client-signature')?.startsWith('{P1363}'))
      return errorResponse('400008', '缺少客户端签名')
    if (request.headers.get('x-client-signature-version') !== '1.3')
      return errorResponse('400009', '签名版本不匹配')
    const publicKey = this.getSettings().signaturePublicKey
    if (!publicKey) return null
    const timestamp = request.headers.get('x-request-timestamp')!
    const rawSignature = request.headers.get('x-client-signature')!.slice('{P1363}'.length)
    let valid = false
    try {
      valid = verify(
        'sha256',
        Buffer.from(`${request.path}${body}${timestamp}`, 'utf8'),
        {
          key: Buffer.from(publicKey, 'base64'),
          format: 'der',
          type: 'spki',
          dsaEncoding: 'ieee-p1363',
        },
        Buffer.from(rawSignature, 'base64'),
      )
    } catch {
      valid = false
    }
    return valid ? null : errorResponse('400011', '客户端签名无效')
  }

  private listItem(order: OkxC2cMockOrder) {
    return {
      id: order.id,
      publicTradingOrderId: order.publicTradingOrderId,
      side: order.side,
      orderStatus: order.orderStatus,
      orderProcessStatus: order.orderProcessStatus,
      paymentStatus: order.paymentStatus,
      baseAmount: order.baseAmount,
      baseCurrency: order.baseCurrency,
      quoteAmount: order.quoteAmount,
      quoteCurrency: order.quoteCurrency,
      createdDate: order.createdDate,
      modifyDate: order.modifyDate,
    }
  }

  private detailItem(order: OkxC2cMockOrder) {
    const account = {
      ...order.sellerReceiptAccount,
      fields: [
        {
          copyValue: order.sellerReceiptAccount.accountName,
          enableCopy: true,
          key: 'accountName',
          name: '姓名',
          value: order.sellerReceiptAccount.accountName,
        },
        {
          copyValue: order.sellerReceiptAccount.accountNo,
          enableCopy: true,
          key: 'accountNo',
          name: '支付宝账号',
          value: order.sellerReceiptAccount.accountNo,
        },
      ],
      extraInfo: order.sellerReceiptAccount.accountNo,
      currency: order.quoteCurrency.toUpperCase(),
    }
    const orderDetailUserVo = {
      realName: order.detailUser.realName,
      kycVerified: order.detailUser.kycVerified,
      nickName: order.detailUser.nickName,
      sellerReceiptAccount: account,
      sellerSelectedReceiptAccount: account,
      sellerAllReceiptAccountList: [account],
    }
    return {
      ...this.listItem(order),
      publicOrderId: order.id,
      price: order.price,
      orderPaidDate: order.orderPaidDate,
      paidDate: order.orderPaidDate ?? 0,
      receiptAccountId: order.receiptAccountId,
      sellerReceiptAccount: account,
      detailUser: order.detailUser,
      orderDetailUserVo,
      sellerAllReceiptAccountList: [account],
      counterPartyName: order.detailUser.realName,
      markAsPaidDisabled: order.orderStatus !== 'new',
      releaseCryptoDisabled: false,
    }
  }
}
