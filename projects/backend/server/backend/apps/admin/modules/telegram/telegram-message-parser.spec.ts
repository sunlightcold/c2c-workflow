import { parseTelegramManualPayments } from './telegram-message-parser'

describe('parseTelegramManualPayments', () => {
  it('parses multiple payments and isolates invalid rows', () => {
    const result = parseTelegramManualPayments(
      ['ORDER-1', '12.50', '张三', '13800138000', 'ORDER-2', 'bad', '李四', '20880001'].join('\n'),
    )
    expect(result).toEqual([
      {
        index: 1,
        input: {
          amount: '12.50',
          payeeIdentity: '13800138000',
          payeeName: '张三',
          sourceBusinessNo: 'ORDER-1',
        },
      },
      { index: 2, error: '金额必须是大于 0 且最多两位有效小数的数字' },
    ])
  })

  it('accepts trailing zero precision in CNY amounts', () => {
    expect(
      parseTelegramManualPayments(['ORDER-1', '100.10000', '张三', '13800138000'].join('\n')),
    ).toEqual([
      {
        index: 1,
        input: {
          amount: '100.10000',
          payeeIdentity: '13800138000',
          payeeName: '张三',
          sourceBusinessNo: 'ORDER-1',
        },
      },
    ])
  })

  it('rejects incomplete groups instead of silently dropping them', () => {
    expect(parseTelegramManualPayments('ORDER-1\n10.00\n张三')).toEqual([
      { index: 1, error: '必须按四行填写：商户订单号、金额、收款姓名、支付宝账号' },
    ])
  })
})
