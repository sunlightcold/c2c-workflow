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
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value)
  if (!match) throw new Error('金额必须是非负数字，最多两位有效小数')
  if (/[1-9]/.test(match[2]?.slice(2) ?? '')) {
    throw new Error('金额必须是非负数字，最多两位有效小数')
  }
  return decimal(value).toFixed(2)
}

/** Compare money by numeric value; upstream APIs may return extra trailing zeros. */
export function sameCnyAmount(left: string, right: string): boolean {
  try {
    return decimal(left).eq(decimal(right))
  } catch {
    return false
  }
}

export function sumCnyAmounts(values: string[]): string {
  return sumDecimalStrings(values.map(normalizeCnyAmount), 2)
}
