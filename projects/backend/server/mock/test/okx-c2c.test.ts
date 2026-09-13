import { beforeEach, describe, expect, it } from 'vitest'
import { addOrder } from '@mock/upstreams/okx-c2c/control'
import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'
import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

const headers = () =>
  new Headers({ Authorization: 'Bearer mock-okx-authorization', Cookie: 'token=mock-okx-token; sid=mock-okx-session' })
const request = (
  method: string,
  path: string,
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
) => ({
  method,
  path,
  query,
  body,
  headers: headers(),
})

describe('OKX C2C mock', () => {
  beforeEach(() => {
    getOkxC2cState().reset()
  })

  it('lists pending BUY orders with the canonical order id', () => {
    addOrder({ publicTradingOrderId: 'BUY-2', createdDate: Date.now() })
    addOrder({ publicTradingOrderId: 'SELL-1', side: 'sell', createdDate: Date.now() })
    const result = getOkxC2cPlugin().handle(
      request('GET', '/v4/c2c/order/getOrderList', {
        orderType: 'pending',
        isBuy: 'true',
        startTime: String(Date.now() - 1000),
        endTime: String(Date.now() + 1000),
        pageSize: '20',
        pageIndex: '1',
      }),
    )
    expect(result.body).toMatchObject({ code: 0, data: { total: 2 } })
    expect((result.body as any).data.items.map((item: any) => item.id)).toEqual([
      '260905000000001',
      'okx-internal-BUY-2',
    ])
  })

  it('filters out pending responses whose process or payment status is not payable', () => {
    addOrder({
      publicTradingOrderId: 'PROCESS-4',
      orderProcessStatus: 4,
      orderStatus: 'completed',
      paymentStatus: 'confirmed',
    })
    addOrder({ publicTradingOrderId: 'PROCESS-3', orderProcessStatus: 3, orderStatus: 'cancelled' })
    const result = getOkxC2cPlugin().handle(
      request('GET', '/v4/c2c/order/getOrderList', { orderType: 'pending', isBuy: 'true' }),
    )
    expect((result.body as any).data.items.map((item: any) => item.id)).toEqual(['260905000000001'])
  })

  it('requires the copied Authorization and Cookie values', () => {
    const result = getOkxC2cPlugin().handle({
      ...request('GET', '/v4/c2c/order/getOrderList', { orderType: 'pending', isBuy: 'true' }),
      headers: new Headers({ Authorization: 'wrong', Cookie: 'wrong' }),
    })
    expect(result.body).toMatchObject({ code: '400001', error_message: 'Authorization不匹配' })
  })

  it('returns identity and receipt account details, and supports anti-fraud review', () => {
    const detail = getOkxC2cPlugin().handle(request('GET', '/v3/c2c/orders/260905000000001'))
    expect(detail.body).toMatchObject({
      code: 0,
      data: {
        publicOrderId: '260905000000001',
        paymentDeadline: expect.any(Number),
        receiptAccountId: '25990076',
        counterPartyName: '测试用户',
        orderDetailUserVo: { realName: '测试用户', kycVerified: true, sellerReceiptAccount: { id: '25990076' } },
      },
    })

    getOkxC2cState().updateSettings({ antiFraudReview: true })
    const risk = getOkxC2cPlugin().handle(request('GET', '/v4/c2c/risk/antiFraudPopup/info'))
    expect(risk.body).toMatchObject({ code: 0, data: { shouldShowPopup: true, isShowPopup: true } })
  })

  it('marks payment and transitions the order to completed', () => {
    const result = getOkxC2cPlugin().handle(
      request('POST', '/v3/c2c/orders/260905000000001/payment/paid', {}, { receiptAccountId: 25990076 }),
    )
    expect(result.body).toMatchObject({ code: 0 })
    expect(getOkxC2cState().orders.find('260905000000001')).toMatchObject({
      orderStatus: 'completed',
      orderProcessStatus: 4,
      paymentStatus: 'confirmed',
    })
  })

  it('rejects an incorrect account and supports deterministic failures', () => {
    const badAccount = getOkxC2cPlugin().handle(
      request('POST', '/v3/c2c/orders/260905000000001/payment/paid', {}, { receiptAccountId: 1 }),
    )
    expect(badAccount.body).toMatchObject({ code: '400004' })
    getOkxC2cState().updateSettings({ markOrderAsPaidFailure: true })
    const failed = getOkxC2cPlugin().handle(
      request('POST', '/v3/c2c/orders/260905000000001/payment/paid', {}, { receiptAccountId: 25990076 }),
    )
    expect(failed.body).toMatchObject({ code: '400003' })
  })
})
