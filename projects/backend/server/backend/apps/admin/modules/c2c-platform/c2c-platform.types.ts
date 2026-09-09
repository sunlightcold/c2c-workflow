export const C2C_HTTP_TRANSPORT = Symbol('C2C_HTTP_TRANSPORT')

export interface C2cHttpRequest {
  method: 'GET' | 'POST'
  url: string
  headers: Record<string, string>
  timeoutMs: number
  body?: unknown
  params?: Record<string, string>
}

export interface C2cHttpTransport {
  request: <T>(request: C2cHttpRequest) => Promise<T>
}

export interface C2cListInput {
  tradeType: 'BUY'
  asset: string
  startDate: number
  endDate: number
  page: number
  rows: number
  orderStatusList: number[]
}

export interface C2cCapabilities {
  listOrders: boolean
  getOrderDetail: boolean
  markOrderAsPaid: boolean
  sellOrders: boolean
}
