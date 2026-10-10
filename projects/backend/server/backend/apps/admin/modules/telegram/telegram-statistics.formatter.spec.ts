import { C2cBuyOrderStatus, type C2cReportOrder } from '../c2c-platform'
import {
  formatProviderReconciliation,
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
  it('summarizes manual platform completion and missing local records without order details', () => {
    const result = formatProviderReconciliation(
      [provider('failed'), provider('no-payment'), provider('missing')],
      [local('failed', 'FAILED'), local('no-payment', null)],
    )
    expect(result.text).toContain('系统未完成付款，平台已完成：2 笔 / 20 USDT / ¥140.00')
    expect(result.text).toContain('平台订单未同步到系统：1 笔 / 10 USDT / ¥70.00')
    expect(result.text).toContain('核对结果：3 笔需核实')
    expect(result).not.toHaveProperty('details')
    expect(result.text).not.toContain('<code>')
    expect(result.text).not.toContain('漏付')
  })

  it('counts awaiting release separately from orders requiring verification', () => {
    const result = formatProviderReconciliation(
      [provider('complete'), provider('paid', C2cBuyOrderStatus.PAID)],
      [local('complete'), local('paid')],
    )
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
    expect(result.text).not.toContain('数据一致')
  })

  it('flags manually paid orders awaiting release when system payment is unsuccessful', () => {
    const result = formatProviderReconciliation(
      [provider('P1', C2cBuyOrderStatus.PAID)],
      [local('P1', 'FAILED')],
    )
    expect(result.text).toContain('平台已付款，系统未完成付款：1 笔 / 10 USDT / ¥70.00')
    expect(result.text).toContain('核对结果：1 笔需核实')
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
  })

  it('counts each discrepancy once without exposing external order identifiers', () => {
    const result = formatProviderReconciliation(
      [{ ...provider('<P&1>'), fiatAmount: '71' }],
      [local('<P&1>', 'FAILED'), local('missing')],
    )
    expect(result.text).toContain('双方订单金额或数量不一致：1 笔 / 10 USDT / ¥71.00')
    expect(result.text).toContain('系统订单未在平台查到：1 笔 / 10 USDT / ¥70.00')
    expect(result.text).not.toContain('<P&1>')
    expect(result.text).not.toContain('missing')
    expect(result.text).toContain('核对结果：2 笔需核实')
  })

  it('recognizes legacy successful payment states', () => {
    expect(
      formatProviderReconciliation([provider('P1')], [local('P1', 'COMPLETED')]).text,
    ).toContain('数据一致')
  })

  it('keeps large discrepancy volumes summarized in fixed rows', () => {
    const orders = Array.from({ length: 1000 }, (_, i) => provider(`external-order-${i}`))
    const result = formatProviderReconciliation(orders, [])
    expect(result.text).toContain('平台订单未同步到系统：1000 笔 / 10000 USDT / ¥70000.00')
    expect(result.text).toContain('核对结果：1000 笔需核实')
    expect(result.text).not.toContain('external-order-')
    expect(result.text).not.toContain('需核实订单')
    expect(result).not.toHaveProperty('details')
    expect(result.text.length).toBeLessThan(1500)
  })

  it('counts verification differences and awaiting release independently', () => {
    const result = formatProviderReconciliation(
      [provider('paid', C2cBuyOrderStatus.PAID), provider('failed')],
      [local('paid'), local('failed', 'FAILED'), local('absent')],
    )
    expect(result.text).toContain('核对结果：2 笔需核实，1 笔待放币')
  })
})
