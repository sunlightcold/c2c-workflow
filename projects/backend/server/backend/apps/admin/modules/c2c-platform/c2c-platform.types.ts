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

export interface C2cPaymentProofImage {
  content: Buffer
  fileName: string
  imageType: 'jpeg' | 'png' | 'webp'
  width?: number
  height?: number
}

export interface C2cMarkPaidOptions {
  fiat?: string
  paymentProofImages?: C2cPaymentProofImage[]
  skipPaymentProofUpload?: boolean
}

export interface C2cComplaintReason {
  reasonCode: number
  reasonDesc: string
}

export interface C2cComplaintUpload {
  filePath: string
  uploadUrl: string
}

export interface C2cComplaintPayload {
  description: string
  fileUrls: string[]
  orderNo: string
  reason: string
  reasonCode: number
}

export interface C2cComplaintSubmissionResult {
  data: { complaintNo?: number | string }
}

export type C2cPaymentProofMode = 'NONE' | 'SKIP' | 'REQUIRED'

export interface C2cMarkPaidPolicy {
  paymentProof: C2cPaymentProofMode
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
  cancelOrder: boolean
  chat: boolean
  checkAntiFraud: boolean
  listOrders: boolean
  listReportOrders: boolean
  getOrderDetail: boolean
  markOrderAsPaid: boolean
  releaseCrypto: boolean
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
  hasMore: boolean
  items: C2cBuyOrderSummary[]
  total: number
}

export interface C2cPlatformAdapter<TCredentials> {
  getCapabilities: () => C2cCapabilities
  getMarkPaidPolicy: (credentials: TCredentials) => C2cMarkPaidPolicy
  getOrderDetail: (credentials: TCredentials, orderId: string) => Promise<C2cBuyOrderDetail>
  listOrders: (credentials: TCredentials, input: C2cListInput) => Promise<C2cBuyOrderPage>
  markOrderAsPaid: (
    credentials: TCredentials,
    orderId: string,
    paymentMethodId: number | string,
    options?: C2cMarkPaidOptions,
  ) => Promise<unknown>
}
