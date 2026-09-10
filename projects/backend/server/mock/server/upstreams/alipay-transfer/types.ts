export const ALIPAY_TRANSFER_METHODS = {
  create: 'alipay.fund.trans.uni.transfer',
  query: 'alipay.fund.trans.common.query',
} as const

export type AlipayTransferStatus = 'DEALING' | 'SUCCESS' | 'FAIL'

export interface AlipayTransferOrder {
  id: string
  outBizNo: string
  orderId: string
  payFundOrderId: string
  amount: string
  orderTitle: string
  payeeIdentity: string
  payeeName?: string
  status: AlipayTransferStatus
  errorCode?: string
  errorMsg?: string
  runId?: string
  notifyCount: number
  lastNotifyResult?: string
  createdAt: string
  updatedAt: string
}

export interface AlipayTransferRunOutcome {
  accountNo: string
  status: AlipayTransferStatus
  errorCode?: string
  errorMsg?: string
}

export interface AlipayTransferRunPlan {
  id: string
  runId: string
  outcomes: AlipayTransferRunOutcome[]
  createdAt: string
  updatedAt: string
}

export interface AlipayTransferSettings {
  verifyRequestSign: boolean
  availableAmount: string
  freezeAmount: string
  notifyUrl: string
  callbackSecret: string
}
