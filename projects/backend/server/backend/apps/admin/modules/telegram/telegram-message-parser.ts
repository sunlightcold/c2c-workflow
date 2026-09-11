export interface TelegramManualPaymentInput {
  amount: string
  payeeIdentity: string
  payeeName: string
  sourceBusinessNo: string
}

export interface ParsedTelegramPaymentLine {
  index: number
  input?: TelegramManualPaymentInput
  error?: string
}

const amountPattern = /^(0|[1-9]\d{0,17})(\.\d{1,2})?$/

export function parseTelegramManualPayments(text: string): ParsedTelegramPaymentLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const groups = Math.ceil(lines.length / 4)
  const results: ParsedTelegramPaymentLine[] = []
  for (let index = 0; index < groups; index += 1) {
    const values = lines.slice(index * 4, index * 4 + 4)
    if (values.length !== 4) {
      results.push({
        index: index + 1,
        error: '必须按四行填写：商户订单号、金额、收款姓名、支付宝账号',
      })
      continue
    }
    const [sourceBusinessNo, amount, payeeName, payeeIdentity] = values
    if (!sourceBusinessNo || sourceBusinessNo.length > 128) {
      results.push({ index: index + 1, error: '商户订单号不能为空且不能超过 128 个字符' })
      continue
    }
    if (!amountPattern.test(amount) || Number(amount) <= 0) {
      results.push({ index: index + 1, error: '金额必须是大于 0 且最多两位小数的数字' })
      continue
    }
    if (!payeeName || payeeName.length > 100) {
      results.push({ index: index + 1, error: '收款姓名不能为空且不能超过 100 个字符' })
      continue
    }
    if (!/^1[3-9]\d{9}$|^\d{5,64}$/.test(payeeIdentity)) {
      results.push({ index: index + 1, error: '支付宝收款账号格式不正确' })
      continue
    }
    results.push({
      index: index + 1,
      input: { amount, payeeIdentity, payeeName, sourceBusinessNo },
    })
  }
  return results
}
