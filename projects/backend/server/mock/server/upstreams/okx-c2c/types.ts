export const OKX_C2C_PATHS = {
  listOrders: '/v4/c2c/order/getOrderList',
  antiFraud: '/v4/c2c/risk/antiFraudPopup/info',
  detail: '/v3/c2c/orders',
  markOrderAsPaid: '/v3/c2c/orders/:publicOrderId/payment/paid',
} as const

export interface OkxC2cMockOrder {
  id: string
  publicTradingOrderId: string
  side: 'buy' | 'sell'
  orderStatus: 'new' | 'completed' | 'cancelled'
  orderProcessStatus: number
  paymentStatus: 'unpaid' | 'confirmed'
  baseAmount: string
  baseCurrency: string
  quoteAmount: string
  quoteCurrency: string
  price: string
  createdDate: number
  modifyDate: number
  orderPaidDate: number | null
  receiptAccountId: string
  sellerReceiptAccount: {
    id: string
    accountName: string
    accountNo: string
    type: string
    paymentDescription: string
    bankCode: string
    bankName?: string
  }
  detailUser: {
    realName: string
    kycVerified: boolean
    nickName: string
  }
}

export interface OkxC2cSettings {
  authorization: string
  cookie: string
  antiFraudReview: boolean
  markOrderAsPaidFailure: boolean
}
