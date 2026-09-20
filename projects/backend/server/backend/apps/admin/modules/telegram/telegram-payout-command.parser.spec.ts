import { parseTelegramPayoutCommand } from './telegram-payout-command.parser'

describe('parseTelegramPayoutCommand', () => {
  it.each([
    ['/query PAY001', { kind: 'QUERY', argument: 'PAY001' }],
    ['/query@pay_bot PAY001', { kind: 'QUERY', argument: 'PAY001' }],
    ['查单 PAY001', { kind: 'QUERY', argument: 'PAY001' }],
    ['回单 PAY001', { kind: 'RECEIPT', argument: 'PAY001' }],
    ['今日跑量', { kind: 'STATISTICS' }],
    ['昨日统计', { kind: 'YESTERDAY_STATISTICS' }],
    ['当月统计', { kind: 'CURRENT_MONTH_STATISTICS' }],
    ['提交批次订单', { kind: 'SUBMIT_BATCH' }],
    ['申诉 BN001', { kind: 'APPEAL', argument: 'BN001' }],
    ['日报 20260914', { kind: 'DAILY_REPORT', argument: '20260914' }],
  ])('parses payout bot input %s', (text, expected) => {
    expect(parseTelegramPayoutCommand(text)).toEqual(expected)
  })

  it('keeps four-line payment input separate from short unrelated messages', () => {
    expect(parseTelegramPayoutCommand('M001\n100.00\n张三\n13800138000')).toEqual({
      kind: 'MANUAL_PAYMENT',
      text: 'M001\n100.00\n张三\n13800138000',
    })
    expect(parseTelegramPayoutCommand('你好')).toEqual({ kind: 'UNKNOWN' })
  })
})
