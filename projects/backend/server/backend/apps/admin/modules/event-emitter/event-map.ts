/**
 * 全局事件 Key 常量字典。只有在此处注册并绑定载荷类型的事件才能发送。
 */
export const EVENT_KEYS = {
  ADMIN_SESSION_REVOKED: 'admin.session.revoked',
  TELEGRAM_ORDER_DISCOVERED: 'telegram.order.discovered',
  TELEGRAM_PAYMENT_CREATED: 'telegram.payment.created',
  TELEGRAM_PAYMENT_STATUS: 'telegram.payment.status',
  TELEGRAM_BATCH_STATUS: 'telegram.batch.status',
  TELEGRAM_BATCH_SUBMITTED: 'telegram.batch.submitted',
  TELEGRAM_EXCEPTION: 'telegram.exception',
} as const

export interface AdminSessionRevokedPayload {
  token: string
  userId?: number
}

export interface TelegramOrderDiscoveredPayload {
  tenantId: string
  merchantId: string
  orderIds: string[]
}

export interface TelegramPaymentStatusPayload {
  tenantId: string
  merchantId: string
  paymentOrderId: string
  paymentNo?: string
  sourceBusinessNo?: string
  status: string
  upstreamId?: string | null
  errorMessage?: string | null
  notificationType?: 'STATUS' | 'CREATED'
}

export interface TelegramPaymentCreatedPayload {
  tenantId: string
  merchantId: string
  merchantOrderId: string
  paymentOrderId: string
  paymentNo?: string
  sourceBusinessNo?: string
  amount?: string | null
  currency?: string | null
  paymentMethod?: string | null
  payeeName?: string | null
  payeeIdentity?: string | null
  identityName?: string | null
  identityMatched: boolean
  kycStatus?: string | null
  status: string
  upstreamId?: string | null
  errorMessage?: string | null
}

export interface TelegramBatchStatusPayload {
  tenantId: string
  merchantId: string
  batchId: string
  batchNo?: string
  status: string
  totalCount?: number
  successCount?: number
  failedCount?: number
  processingCount?: number
  unknownCount?: number
  errorMessage?: string | null
}

export interface TelegramBatchSubmittedPayload {
  tenantId: string
  merchantId: string
  totalCount: number
  totalAmount: string
  groups: number
  submitted: number
  failed: number
  errors?: string[]
}

export interface TelegramExceptionPayload {
  tenantId: string
  merchantId?: string
  code: string
  message: string
  referenceId?: string
}

export interface GlobalEventMap {
  [EVENT_KEYS.ADMIN_SESSION_REVOKED]: AdminSessionRevokedPayload
  [EVENT_KEYS.TELEGRAM_ORDER_DISCOVERED]: TelegramOrderDiscoveredPayload
  [EVENT_KEYS.TELEGRAM_PAYMENT_CREATED]: TelegramPaymentCreatedPayload
  [EVENT_KEYS.TELEGRAM_PAYMENT_STATUS]: TelegramPaymentStatusPayload
  [EVENT_KEYS.TELEGRAM_BATCH_STATUS]: TelegramBatchStatusPayload
  [EVENT_KEYS.TELEGRAM_BATCH_SUBMITTED]: TelegramBatchSubmittedPayload
  [EVENT_KEYS.TELEGRAM_EXCEPTION]: TelegramExceptionPayload
}

export type EventNames = keyof GlobalEventMap
