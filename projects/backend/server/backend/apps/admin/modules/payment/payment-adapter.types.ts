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

export interface AlipayPayee {
  amount: string
  payeeIdentity: string
  payeeName: string
}

export function normalizeCnyAmount(value: string): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new Error('金额必须是最多两位小数的非负字符串')
  return `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`
}

export function sumCnyAmounts(values: string[]): string {
  const cents = values.reduce((sum, value) => {
    const normalized = normalizeCnyAmount(value)
    return sum + BigInt(normalized.replace('.', ''))
  }, 0n)
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}
