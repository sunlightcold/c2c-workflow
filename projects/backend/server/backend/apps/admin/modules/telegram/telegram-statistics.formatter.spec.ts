import { C2cBuyOrderStatus, type C2cReportOrder } from '../c2c-platform'
import {
  formatProviderReconciliation,
  splitStatisticsMessages,
  type LocalReconciliationOrder,
} from './telegram-statistics.formatter'

const provider = (id: string, status = C2cBuyOrderStatus.COMPLETED): C2cReportOrder => ({
  platformOrderId: id,
  status,
  side: 'BUY',
  asset: 'USDT',
  assetAmount: '10.000000000000000000',
  fiatCurrency: 'CNY',
  fiatAmount: '70.00000',
  createdAt: '2026-10-10T01:00:00Z',
})
const local = (id: string, paymentStatus: string | null = 'SUCCESS'): LocalReconciliationOrder => ({
  platformOrderId: id,
  paymentStatus,
  assetAmount: '10',
  fiatAmount: '70',
})

describe('Telegram live statistics reconciliation', () => {
  it('separates manual platform completion, missing payment orders, and completely missing local orders', () => {
    const result = formatProviderReconciliation(
      [provider('failed'), provider('no-payment'), provider('missing')],
      [local('failed', 'FAILED'), local('no-payment', null)],
    )
    expect(result.text).toContain('系统未完成付款，平台已完成：2 笔 / 20 USDT / ¥140.00')
    expect(result.text).toContain('平台订单未同步到系统：1 笔 / 10 USDT / ¥70.00')
    expect(result.text).toContain('核对结果：3 笔需核实')
    expect(result.details).toEqual([
      '<code>failed</code>｜平台已完成，系统付款失败｜10 USDT｜¥70.00',
      '<code>no-payment</code>｜平台已完成，系统无支付订单｜10 USDT｜¥70.00',
      '<code>missing</code>｜平台订单未同步到系统｜10 USDT｜¥70.00',
    ])
    expect(result.text).not.toContain('漏付')
  })

  it('counts awaiting release without adding normal orders to verification details', () => {
    const result = formatProviderReconciliation(
      [provider('complete'), provider('paid', C2cBuyOrderStatus.PAID)],
      [local('complete'), local('paid')],
    )
    expect(result.details).toEqual([])
    expect(result.text).toContain('核对结果：1 笔待放币，无其他差异')
    expect(result.text).toContain('汇总：2 笔 / 20 USDT / ¥140.00')
  })

  it.each([
    C2cBuyOrderStatus.CANCELLED,
    C2cBuyOrderStatus.EXPIRED,
    C2cBuyOrderStatus.PENDING_PAYMENT,
    C2cBuyOrderStatus.DISPUTED,
    C2cBuyOrderStatus.UNKNOWN,
  ])('flags paid orders with platform status %s', (status) => {
    const result = formatProviderReconciliation([provider('P1', status)], [local('P1')])
    expect(result.text).toContain('核对结果：1 笔需核实')
    expect(result.details).toHaveLength(1)
    expect(result.text).not.toContain('数据一致')
  })

  it('flags manually paid orders awaiting release when system payment is unsuccessful', () => {
    const result = formatProviderReconciliation(
      [provider('P1', C2cBuyOrderStatus.PAID)],
      [local('P1', 'FAILED')],
    )
    expect(result.text).toContain('平台已付款，系统未完成付款：1 笔 / 10 USDT / ¥70.00')
    expect(result.details[0]).toContain('平台已付款待放币，系统付款失败')
  })

  it('uses decimal equality and retains 18-digit precision in aggregates', () => {
    const result = formatProviderReconciliation(
      [
        { ...provider('P1'), assetAmount: '0.100000000000000001', fiatAmount: '100.10000' },
        { ...provider('P2'), assetAmount: '0.2', fiatAmount: '100.10' },
      ],
      [
        { ...local('P1'), assetAmount: '0.100000000000000001', fiatAmount: '100.1' },
        { ...local('P2'), assetAmount: '0.20000', fiatAmount: '100.1000' },
      ],
    )
    expect(result.text).toContain('汇总：2 笔 / 0.300000000000000001 USDT / ¥200.20')
    expect(result.text).toContain('数据一致')
    expect(result.details).toEqual([])
  })

  it('reports each discrepancy once and escapes external order identifiers', () => {
    const result = formatProviderReconciliation(
      [{ ...provider('<P&1>'), fiatAmount: '71' }],
      [local('<P&1>', 'FAILED'), local('missing')],
    )
    expect(result.details).toHaveLength(2)
    expect(result.details[0]).toContain('<code>&lt;P&amp;1&gt;</code>')
    expect(result.details[0]).toContain('数量/金额不一致，系统 10 USDT / ¥70.00')
    expect(result.details[1]).toContain('系统订单未在平台查到')
    expect(result.text).toContain('核对结果：2 笔需核实')
  })

  it('recognizes legacy successful payment states', () => {
    expect(
      formatProviderReconciliation([provider('P1')], [local('P1', 'COMPLETED')]).details,
    ).toEqual([])
  })

  it('keeps short details within the approved template and splits long details without dropping orders', () => {
    const short = splitStatisticsMessages('summary', ['order'], 'timestamp')
    expect(short).toEqual(['summary\n\n<b>需核实订单</b>\norder\n\ntimestamp'])
    const lines = Array.from(
      { length: 250 },
      (_, i) => `<code>P${i}</code>｜平台已完成，系统付款失败｜10 USDT｜¥70.00`,
    )
    const messages = splitStatisticsMessages('summary', lines, 'timestamp')
    expect(messages.length).toBeGreaterThan(1)
    expect(messages.every((message) => message.length <= 3500)).toBe(true)
    for (const line of lines)
      expect(messages.filter((message) => message.includes(line))).toHaveLength(1)
    expect(messages.at(-1)).toContain('timestamp')
  })
})
