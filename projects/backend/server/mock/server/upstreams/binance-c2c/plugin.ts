import { createHmac } from 'node:crypto'
import type { BinanceC2cMockOrder, BinanceC2cSettings } from './types'
import { BINANCE_C2C_PATHS } from './types'
import { getBinanceC2cState } from './state'

interface BinanceRequest {
  path: string
  body: Record<string, unknown>
  query: Record<string, string>
  headers: Headers
}

function errorResponse(code: string, message: string, status = 400) {
  return { status, body: { code, message, success: false, data: null } }
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}不能为空`)
  return value.trim()
}

function parseDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('订单时间格式错误')
  return date.getTime()
}

export class BinanceC2cMockPlugin {
  readonly id = 'binance-c2c'
  readonly paths = Object.values(BINANCE_C2C_PATHS)

  constructor(
    private readonly getSettings: () => BinanceC2cSettings,
    private readonly list: () => BinanceC2cMockOrder[],
    private readonly find: (id: string) => BinanceC2cMockOrder | undefined,
    private readonly update: (
      id: string,
      updater: (order: BinanceC2cMockOrder) => BinanceC2cMockOrder,
    ) => BinanceC2cMockOrder | undefined,
  ) {}

  handle(request: BinanceRequest) {
    try {
      this.verify(request)
      if (request.path === BINANCE_C2C_PATHS.listOrders) return this.listOrders(request.body)
      if (request.path === BINANCE_C2C_PATHS.reportOrders) return this.reportOrders(request.query)
      if (request.path === BINANCE_C2C_PATHS.detail) return this.detail(request.body)
      if (request.path === BINANCE_C2C_PATHS.markOrderAsPaid) return this.markOrderAsPaid(request.body)
      if (request.path === BINANCE_C2C_PATHS.complaintReasons) return this.complaintReasons(request.body)
      if (request.path === BINANCE_C2C_PATHS.complaintUploadUrl) return this.complaintUploadUrl(request.query)
      if (request.path === BINANCE_C2C_PATHS.complaintSubmit) return this.complaintSubmit(request.body)
      return errorResponse('404', '接口不存在', 404)
    } catch (error) {
      return errorResponse('400001', (error as Error).message)
    }
  }

  private verify(request: BinanceRequest) {
    const settings = this.getSettings()
    if (request.headers.get('x-mbx-apikey') !== settings.apiKey) throw new Error('API Key不匹配')
    if (request.headers.get('clienttype') !== settings.clientType) throw new Error('clientType不匹配')
    if (!settings.verifySignature) return
    const timestamp = request.query.timestamp
    const recvWindow = request.query.recvWindow
    const signature = request.query.signature
    if (!timestamp || !recvWindow || !signature) throw new Error('缺少签名参数')
    if (!/^\d+$/.test(timestamp) || !/^\d+$/.test(recvWindow)) throw new Error('签名参数格式错误')
    if (Math.abs(Date.now() - Number(timestamp)) > Number(recvWindow)) throw new Error('请求时间戳已过期')
    const query = new URLSearchParams(Object.entries(request.query).filter(([key]) => key !== 'signature')).toString()
    const expected = createHmac('sha256', settings.secretKey).update(query).digest('hex')
    if (signature !== expected) throw new Error('签名校验失败')
  }

  private listOrders(body: Record<string, unknown>) {
    const asset = requiredString(body.asset, 'asset')
    const tradeType = requiredString(body.tradeType, 'tradeType')
    const page = Number(body.page)
    const rows = Number(body.rows)
    const startDate = Number(body.startDate)
    const endDate = Number(body.endDate)
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(rows) || rows < 1)
      throw new Error('分页参数错误')
    const statuses = Array.isArray(body.orderStatusList) ? body.orderStatusList.map(Number) : []
    const orders = this.list().filter((order) => {
      const createdAt = parseDate(order.createTime)
      return (
        order.asset === asset &&
        order.tradeType === tradeType &&
        (!statuses.length || statuses.includes(order.orderStatus)) &&
        (!Number.isFinite(startDate) || createdAt >= startDate) &&
        (!Number.isFinite(endDate) || createdAt <= endDate)
      )
    })
    const offset = (page - 1) * rows
    return {
      status: 200,
      body: {
        code: '000000',
        success: true,
        total: orders.length,
        data: orders.slice(offset, offset + rows).map(this.toListItem),
      },
    }
  }

  private reportOrders(query: Record<string, string>) {
    const page = Number(query.page)
    const rows = Number(query.rows)
    const startTimestamp = Number(query.startTimestamp)
    const endTimestamp = Number(query.endTimestamp)
    const tradeType = query.tradeType?.trim()
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(rows) || rows < 1) {
      throw new Error('分页参数错误')
    }
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) throw new Error('日期参数错误')
    const orders = this.list().filter((order) => {
      const createdAt = parseDate(order.createTime)
      return createdAt >= startTimestamp && createdAt <= endTimestamp && (!tradeType || order.tradeType === tradeType)
    })
    const offset = (page - 1) * rows
    return {
      status: 200,
      body: {
        code: '000000',
        success: true,
        total: orders.length,
        data: orders.slice(offset, offset + rows).map(this.toListItem),
      },
    }
  }

  private detail(body: Record<string, unknown>) {
    const orderNumber = requiredString(body.adOrderNo, 'adOrderNo')
    const order = this.find(orderNumber)
    if (!order) return errorResponse('400002', '订单不存在', 404)
    const { id: _id, ...detail } = order
    return { status: 200, body: { code: '000000', success: true, data: detail } }
  }

  private markOrderAsPaid(body: Record<string, unknown>) {
    if (this.getSettings().markOrderAsPaidFailure) return errorResponse('400003', '模拟确认付款失败')
    const orderNumber = requiredString(body.orderNumber, 'orderNumber')
    const order = this.find(orderNumber)
    if (!order) return errorResponse('400002', '订单不存在', 404)
    const payId = Number(body.payId)
    if (!Number.isSafeInteger(payId) || String(payId) !== order.selectedPayId) {
      return errorResponse('400004', '付款方式ID不匹配')
    }
    if (![1, 2].includes(order.orderStatus)) return errorResponse('400005', '当前订单状态不允许标记付款')
    const updated = this.update(orderNumber, (current) => ({
      ...current,
      orderStatus: 2,
      updateTime: new Date().toISOString(),
    }))
    if (!updated) return errorResponse('400002', '订单不存在', 404)
    return {
      status: 200,
      body: {
        code: '000000',
        success: true,
        message: 'success',
        data: {
          orderNumber: updated.orderNumber,
          orderStatus: updated.orderStatus,
          selectedPayId: payId,
          notifyPayTime: updated.updateTime,
        },
      },
    }
  }

  private complaintReasons(body: Record<string, unknown>) {
    const orderNumber = requiredString(body.orderNo, 'orderNo')
    const order = this.find(orderNumber)
    if (!order) return errorResponse('400002', '订单不存在', 404)
    return {
      status: 200,
      body: {
        code: '000000',
        success: true,
        data: order.complaintReasons ?? [{ reasonCode: 1, reasonDesc: '我已付款，卖家未放行' }],
      },
    }
  }

  private complaintUploadUrl(query: Record<string, string>) {
    const fileName = requiredString(query.fileName, 'fileName')
    return {
      status: 200,
      body: {
        code: '000000',
        success: true,
        data: {
          uploadUrl: 'http://127.0.0.1:3002/api/mock/binance-c2c/complaint-upload',
          filePath: `/mock/complaints/${encodeURIComponent(fileName)}`,
        },
      },
    }
  }

  private complaintSubmit(body: Record<string, unknown>) {
    const orderNumber = requiredString(body.orderNo, 'orderNo')
    const order = this.find(orderNumber)
    if (!order) return errorResponse('400002', '订单不存在', 404)
    requiredString(body.description, 'description')
    requiredString(body.reason, 'reason')
    const reasonCode = Number(body.reasonCode)
    if (!Number.isSafeInteger(reasonCode)) throw new Error('reasonCode格式错误')
    if (!Array.isArray(body.fileUrls) || !body.fileUrls.length) throw new Error('fileUrls不能为空')
    return {
      status: 200,
      body: {
        code: '000000',
        success: true,
        message: 'success',
        data: { complaintNo: getBinanceC2cState().nextComplaintNo() },
      },
    }
  }

  private toListItem(order: BinanceC2cMockOrder) {
    return {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      totalPrice: order.totalPrice,
      amount: order.amount,
      asset: order.asset,
      fiat: order.fiat,
      tradeType: order.tradeType,
      createTime: order.createTime,
    }
  }
}
