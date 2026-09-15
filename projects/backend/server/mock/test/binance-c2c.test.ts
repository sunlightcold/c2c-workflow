import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addOrder } from '@mock/upstreams/binance-c2c/control'
import { getBinanceC2cPlugin } from '@mock/upstreams/binance-c2c/plugin-registry'
import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'

const secretKey = 'mock-binance-secret-key'

function request(
  path: string,
  body: Record<string, unknown>,
  extraQuery: Record<string, string> = {},
  externalMerchantId?: string,
) {
  const timestamp = String(Date.now())
  const recvWindow = '5000'
  const queryParams = { ...extraQuery, recvWindow, timestamp }
  const signature = createHmac('sha256', secretKey).update(new URLSearchParams(queryParams).toString()).digest('hex')
  return {
    path,
    body,
    query: { ...queryParams, signature },
    headers: new Headers({
      'X-MBX-APIKEY': 'mock-binance-api-key',
      clientType: 'WEB',
      ...(externalMerchantId ? { 'x-user-id': externalMerchantId } : {}),
    }),
  }
}

describe('Binance C2C mock', () => {
  beforeEach(() => {
    getBinanceC2cState().reset()
  })

  it('lists only matching BUY orders and returns fiat totalPrice', () => {
    addOrder({
      orderNumber: 'ORDER_BUY',
      totalPrice: '133.00',
      amount: '0.0019',
      createTime: '2026-08-24T10:00:00.000Z',
      paymentMethod: {
        id: '1',
        payAccount: '13822079784',
        fieldList: [{ fieldName: 'account_name', fieldValue: '杨圳' }],
      },
      realName: '杨圳',
    })
    addOrder({ orderNumber: 'ORDER_SELL', tradeType: 'SELL' })

    const result = getBinanceC2cPlugin().handle(
      request('/sapi/v1/c2c/orderMatch/listOrders', {
        asset: 'USDT',
        tradeType: 'BUY',
        orderStatusList: [1],
        page: 1,
        rows: 20,
        startDate: Date.parse('2026-08-24T00:00:00.000Z'),
        endDate: Date.parse('2026-08-25T00:00:00.000Z'),
      }),
    )

    expect(result.body).toMatchObject({ code: '000000', success: true, total: 1 })
    expect((result.body as any).data[0]).toMatchObject({ orderNumber: 'ORDER_BUY', totalPrice: '133.00' })
  })

  it('isolates orders by the merchant account carried in x-user-id', () => {
    addOrder({ orderNumber: 'HQ_ORDER', externalMerchantId: 'mock-hq-binance' })
    addOrder({ orderNumber: 'AGENT_ORDER', externalMerchantId: 'mock-agent-binance' })

    const headquarters = getBinanceC2cPlugin().handle(
      request(
        '/sapi/v1/c2c/orderMatch/listOrders',
        {
          asset: 'USDT',
          tradeType: 'BUY',
          orderStatusList: [1],
          page: 1,
          rows: 20,
          startDate: 0,
          endDate: Date.now() + 60_000,
        },
        {},
        'mock-hq-binance',
      ),
    )
    expect((headquarters.body as any).data).toEqual([
      expect.objectContaining({ orderNumber: 'HQ_ORDER' }),
    ])

    const hiddenDetail = getBinanceC2cPlugin().handle(
      request(
        '/sapi/v1/c2c/orderMatch/getUserOrderDetail',
        { adOrderNo: 'HQ_ORDER' },
        {},
        'mock-agent-binance',
      ),
    )
    expect(hiddenDetail).toMatchObject({
      status: 404,
      body: { code: '400002', message: '订单不存在' },
    })
  })

  it('lists report orders by trade type and serves complaint reasons', () => {
    addOrder({
      orderNumber: 'REPORT_BUY',
      createTime: '2026-08-29T10:00:00.000Z',
      complaintReasons: [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }],
    })
    addOrder({ orderNumber: 'REPORT_SELL', tradeType: 'SELL', createTime: '2026-08-29T11:00:00.000Z' })

    const report = getBinanceC2cPlugin().handle(
      request(
        '/sapi/v1/c2c/orderMatch/listUserOrderHistory',
        {},
        {
          startTimestamp: String(Date.parse('2026-08-29T00:00:00.000Z')),
          endTimestamp: String(Date.parse('2026-08-30T00:00:00.000Z')),
          page: '1',
          rows: '100',
          tradeType: 'BUY',
        },
      ),
    )
    expect(report.body).toMatchObject({ code: '000000', success: true, total: 1 })
    expect((report.body as any).data[0]).toMatchObject({ orderNumber: 'REPORT_BUY', tradeType: 'BUY' })

    const reasons = getBinanceC2cPlugin().handle(
      request('/sapi/v1/c2c/complaint/get-complaint-reasons', { orderNo: 'REPORT_BUY' }),
    )
    expect(reasons.body).toMatchObject({ data: [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }] })
  })

  it('returns the selected payment method and rejects bad signatures', () => {
    addOrder({
      orderNumber: 'ORDER_DETAIL',
      selectedPayId: '2',
      payMethods: [
        { id: '1', payAccount: '111', fieldList: [{ fieldName: 'account_name', fieldValue: '错误' }] },
        { id: '2', payAccount: '222', fieldList: [{ fieldName: 'account_name', fieldValue: '正确' }] },
      ],
    })
    const detail = getBinanceC2cPlugin().handle(
      request('/sapi/v1/c2c/orderMatch/getUserOrderDetail', { adOrderNo: 'ORDER_DETAIL' }),
    )
    expect(detail.body).toMatchObject({ code: '000000', success: true })
    expect((detail.body as any).data).toMatchObject({
      selectedPayId: '2',
      orderNumber: 'ORDER_DETAIL',
    })
    expect((detail.body as any).data).not.toHaveProperty('paymentDeadline')

    const invalid = getBinanceC2cPlugin().handle({
      ...request('/sapi/v1/c2c/orderMatch/getUserOrderDetail', { adOrderNo: 'ORDER_DETAIL' }),
      query: { recvWindow: '5000', timestamp: String(Date.now()), signature: 'invalid' },
    })
    expect(invalid.body).toMatchObject({ code: '400001', success: false })
  })

  it('marks an order as paid with the selected payment method', () => {
    addOrder({ orderNumber: 'ORDER_PAID', selectedPayId: '2', paymentMethod: { id: '2' } })

    const result = getBinanceC2cPlugin().handle(
      request('/sapi/v1/c2c/orderMatch/markOrderAsPaid', { orderNumber: 'ORDER_PAID', payId: 2 }),
    )

    expect(result.body).toMatchObject({
      code: '000000',
      success: true,
      data: { orderNumber: 'ORDER_PAID', orderStatus: 2, selectedPayId: 2 },
    })
    expect(getBinanceC2cState().orders.find('ORDER_PAID')?.orderStatus).toBe(2)
  })

  it('supports deterministic mark-paid failures', () => {
    addOrder({ orderNumber: 'ORDER_FAIL' })
    getBinanceC2cState().updateSettings({ markOrderAsPaidFailure: true })

    const result = getBinanceC2cPlugin().handle(
      request('/sapi/v1/c2c/orderMatch/markOrderAsPaid', { orderNumber: 'ORDER_FAIL', payId: 1 }),
    )

    expect(result.body).toMatchObject({ code: '400003', success: false })
    expect(getBinanceC2cState().orders.find('ORDER_FAIL')?.orderStatus).toBe(1)
  })
})
