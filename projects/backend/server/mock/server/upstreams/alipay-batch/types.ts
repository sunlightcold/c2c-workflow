export const ALIPAY_BATCH_METHODS = {
  create: 'alipay.fund.batch.create',
  detailQuery: 'alipay.fund.batch.detail.query',
  close: 'alipay.fund.batch.close',
  balance: 'alipay.fund.account.query',
  receiptApply: 'alipay.data.bill.ereceipt.apply',
  receiptQuery: 'alipay.data.bill.ereceipt.query',
} as const

export type AlipayBatchStatus =
  | 'INIT'
  | 'WAIT_PAY'
  | 'DEALING'
  | 'SUCCESS'
  | 'PART_SUCCESS'
  | 'FAIL'
  | 'INVALID'
  | 'DISUSE'

export type AlipayBatchDetailStatus = 'INIT' | 'WAIT_PAY' | 'DEALING' | 'SUCCESS' | 'FAIL'

export interface AlipayBatchOrderDetail {
  outBizNo: string
  detailId: string
  alipayOrderNo: string
  amount: string
  orderTitle: string
  remark: string
  payeeIdentity: string
  payeeIdentityType: string
  payeeName: string
  detailStatus: AlipayBatchDetailStatus
  errorCode?: string
  errorMsg?: string
}

export interface AlipayBatchOrder {
  id: string
  outBatchNo: string
  batchTransId: string
  amount: string
  orderTitle: string
  remark: string
  details: AlipayBatchOrderDetail[]
  batchStatus: AlipayBatchStatus
  queryCount: number
  notifyCount: number
  lastNotifyResult?: string
  createdAt: string
  updatedAt: string
}

export interface AlipayBatchRunOutcome {
  outBizNo: string
  status: AlipayBatchDetailStatus
  errorCode?: string
  errorMsg?: string
}

export interface AlipayBatchRunPlan {
  id: string
  runId: string
  outcomes: AlipayBatchRunOutcome[]
  createdAt: string
  updatedAt: string
}

export type AlipayReceiptStatus = 'INIT' | 'PROCESS' | 'SUCCESS' | 'FAIL'

export interface AlipayReceiptRecord {
  id: string
  fileId: string
  detailId: string
  status: AlipayReceiptStatus
  queryCount: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface AlipayBatchSettings {
  availableAmount: string
  freezeAmount: string
  verifyRequestSign: boolean
  createBatchStatus: AlipayBatchStatus
  createDetailStatus: AlipayBatchDetailStatus
  autoAdvanceAfterQueries: number
  autoAdvanceBatchStatus: AlipayBatchStatus
  autoAdvanceDetailStatus: AlipayBatchDetailStatus
  randomDetailFailRate: number
  notifyUrl: string
  receiptReadyAfterQueries: number
  receiptFinalStatus: Extract<AlipayReceiptStatus, 'SUCCESS' | 'FAIL'>
  receiptErrorMessage: string
}

export interface AlipayTestKeys {
  appPrivateKey: string
  appPublicKey: string
  alipayPrivateKey: string
  alipayPublicKey: string
}
