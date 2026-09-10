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
    body: { code, error_code: code, msg: message, error_message: message, detailMsg: message, data: null },
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
      if (request.method === 'GET' && request.path === '/v4/c2c/risk/antiFraudPopup/info') return this.antiFraud()
      if (request.method === 'GET' && request.path.startsWith('/v3/c2c/orders/')) return this.detail(request.path)
      if (request.method === 'POST' && request.path.endsWith('/payment/paid'))
        return this.markOrderAsPaid(request.path, request.body)
      return errorResponse('404', '接口不存在', 404)
    } catch (error) {
      return errorResponse('400001', (error as Error).message)
    }
  }

  private verify(request: OkxRequest) {
    const settings = this.getSettings()
    if (request.headers.get('authorization') !== settings.authorization) throw new Error('Authorization不匹配')
    if (request.headers.get('cookie') !== settings.cookie) throw new Error('Cookie不匹配')
  }

  private listOrders(query: Record<string, string>) {
    if (query.orderType !== 'pending' || query.isBuy !== 'true')
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

  private markOrderAsPaid(path: string, body: Record<string, unknown>) {
    if (this.getSettings().markOrderAsPaidFailure) return errorResponse('400003', '模拟确认付款失败')
    const marker = '/v3/c2c/orders/'
    const id = required(path.slice(marker.length, path.indexOf('/payment/paid')), 'orderId')
    const order = this.find(id)
    if (!order) return errorResponse('400404', '订单不存在', 404)
    if (String(body.receiptAccountId) !== order.receiptAccountId)
      return errorResponse('400004', 'receiptAccountId不匹配')
    if (order.orderStatus !== 'new' || order.paymentStatus !== 'unpaid')
      return errorResponse('400005', '当前订单状态不允许标记付款')
    const now = Date.now()
    const updated = this.update(id, (current) => ({
      ...current,
      orderStatus: 'completed',
      orderProcessStatus: 4,
      paymentStatus: 'confirmed',
      orderPaidDate: now,
      modifyDate: now,
    }))
    if (!updated) return errorResponse('400404', '订单不存在', 404)
    return { status: 200, body: { code: 0, data: {}, requestId: 'mock-paid-request' } }
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
