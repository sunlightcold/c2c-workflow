import type { PaymentBatchStatus, PaymentExecutionMode, PaymentOrderStatus } from '@admin/database'

export interface AutomaticPaymentCandidate {
  tenantId: string
  merchantId: string
  merchantOrderId: string
  executionMode: PaymentExecutionMode
  paymentOrderId: string | null
  paymentOrderStatus: PaymentOrderStatus | null
  paymentOrderExecutionMode: PaymentExecutionMode | null
}

export interface AutomaticPaymentScope {
  tenantId: string
  merchantId: string
}

export interface RecoverablePayment {
  id: string
  tenantId: string
  status: PaymentOrderStatus
  upstreamId: string | null
}

export interface RecoverableBatch {
  id: string
  tenantId: string
  status: PaymentBatchStatus
}

export interface C2cAutomaticPaymentStore {
  findCandidates: (now: Date, limit: number) => Promise<AutomaticPaymentCandidate[]>
  findBatchScopes: (limit: number) => Promise<AutomaticPaymentScope[]>
  findRecoverablePayments: (limit: number) => Promise<RecoverablePayment[]>
  findRecoverableBatches: (limit: number) => Promise<RecoverableBatch[]>
  runLocked: <T>(key: string, work: () => Promise<T>) => Promise<T | undefined>
}
