export const C2C_HTTP_TRANSPORT = Symbol('C2C_HTTP_TRANSPORT')

export interface C2cHttpRequest {
  method: 'GET' | 'POST' | 'PUT'
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
  appeal: boolean
  listOrders: boolean
  getOrderDetail: boolean
  markOrderAsPaid: boolean
  sellOrders: boolean
}

export enum C2cBuyOrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface C2cBuyOrderSummary {
  platformOrderId: string
  side: 'BUY'
  status: C2cBuyOrderStatus
  asset: string
  assetAmount: string
  fiatCurrency: string
  fiatAmount: string
  createdAt: string
}

export interface C2cBuyOrderDetail extends Omit<C2cBuyOrderSummary, 'assetAmount'> {
  assetAmount: string | null
  platformPaymentMethodId: string
  paymentMethod: string
  payeeIdentity: string
  payeeName: string
  identityName: string
  payable: boolean
  paymentDeadline?: string
  updatedAt?: string
}

export interface C2cBuyOrderPage {
  items: C2cBuyOrderSummary[]
  total: number
}
