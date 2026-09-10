export const BINANCE_C2C_PATHS = {
  listOrders: '/sapi/v1/c2c/orderMatch/listOrders',
  reportOrders: '/sapi/v1/c2c/orderMatch/listUserOrderHistory',
  detail: '/sapi/v1/c2c/orderMatch/getUserOrderDetail',
  markOrderAsPaid: '/sapi/v1/c2c/orderMatch/markOrderAsPaid',
  complaintReasons: '/sapi/v1/c2c/complaint/get-complaint-reasons',
  complaintUploadUrl: '/sapi/v1/c2c/file-upload/get-s3-presigned-url',
  complaintSubmit: '/sapi/v1/c2c/complaint/submit-complaint',
} as const

export interface BinanceC2cPaymentField {
  fieldName?: string
  fieldTitleKey?: string
  fieldValue?: string
}

export interface BinanceC2cPayMethod {
  id: string
  identifier: string
  tradeMethodName: string
  payAccount: string
  payBank?: string
  fieldList: BinanceC2cPaymentField[]
}

export interface BinanceC2cMockOrder {
  id: string
  orderNumber: string
  orderStatus: number
  totalPrice: string
  amount: string
  asset: string
  fiat: string
  fiatUnit: string
  tradeType: 'BUY' | 'SELL'
  createTime: string
  updateTime: string
  selectedPayId: string
  payMethods: BinanceC2cPayMethod[]
  complaintReasons?: Array<{ reasonCode: number; reasonDesc: string }>
  isSellerCompanyAccount?: boolean
  sellerCompanyAccountName?: string
  taker: {
    realName?: string
    userKycVo: {
      firstName?: string
      middleName?: string
      lastName?: string
      idNo?: string
      kycStatus: string
    }
  }
}

export interface BinanceC2cSettings {
  verifySignature: boolean
  markOrderAsPaidFailure: boolean
  apiKey: string
  secretKey: string
  clientType: string
}
