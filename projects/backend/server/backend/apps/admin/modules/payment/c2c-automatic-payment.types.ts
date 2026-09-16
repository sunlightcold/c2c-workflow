import type {
  PaymentBatchStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PlatformConfirmationStatus,
} from '@admin/database'

export interface AutomaticPaymentCandidate {
  tenantId: string
  merchantId: string
  merchantOrderId: string
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
  merchantId: string
  status: PaymentOrderStatus
  upstreamId: string | null
  platformConfirmStatus: PlatformConfirmationStatus
}

export interface RecoverableBatch {
  id: string
  tenantId: string
  merchantId: string
  status: PaymentBatchStatus
}

export interface C2cAutomaticPaymentStore {
  findCandidates: (now: Date, limit: number) => Promise<AutomaticPaymentCandidate[]>
  findBatchScopes: (limit: number) => Promise<AutomaticPaymentScope[]>
  findRecoverablePayments: (limit: number) => Promise<RecoverablePayment[]>
  findRecoverableBatches: (limit: number) => Promise<RecoverableBatch[]>
  claimFailureNotification: (input: {
    tenantId: string
    merchantId: string
    code: string
    referenceId: string
    message: string
  }) => Promise<boolean>
  runLocked: <T>(key: string, work: () => Promise<T>) => Promise<T | undefined>
}
