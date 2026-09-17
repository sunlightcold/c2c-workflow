import { decimal, sumDecimalStrings } from '@/common/utils/decimal'

export const ALIPAY_GATEWAY = Symbol('ALIPAY_GATEWAY')

export enum PaymentExecutionStatus {
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export interface AlipayGateway {
  /** Gateway instances are bound to one payment account credential by the execution factory. */
  execute: <T>(method: string, bizContent: Record<string, unknown>) => Promise<T>
}

export interface PaymentExecutionResult<T = unknown> {
  status: PaymentExecutionStatus
  upstreamId?: string
  errorMessage?: string
  raw: T
}

export interface PaymentReconciliationPolicy {
  enabled: boolean
  initialDelaySeconds: number
  intervalSeconds: number
  maxAttempts: number
}

export interface AlipayPayee {
  amount: string
  payeeIdentity: string
  payeeName: string
}

export function normalizeCnyAmount(value: string): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new Error('金额必须是最多两位小数的非负字符串')
  return decimal(value).toFixed(2)
}

export function sumCnyAmounts(values: string[]): string {
  return sumDecimalStrings(values.map(normalizeCnyAmount), 2)
}
