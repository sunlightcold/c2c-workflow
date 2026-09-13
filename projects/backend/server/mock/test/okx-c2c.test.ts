import { beforeEach, describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { addOrder } from '@mock/upstreams/okx-c2c/control'
import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'
import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

const headers = (paid = false) =>
  new Headers({
    Authorization: 'Bearer mock-okx-authorization',
    Cookie: 'token=mock-okx-token; sid=mock-okx-session',
    ...(paid
      ? {
          'x-request-timestamp': String(Date.now()),
          'x-client-signature': '{P1363}mock-signature',
          'x-client-signature-version': '1.3',
        }
      : {}),
  })
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
      request('GET', '/v4/c2c/order/getOrderList', { orderType: 'pending' }),
    )
    expect((result.body as any).data.items.map((item: any) => item.id)).toEqual(['260905000000001'])
  })

  it('requires the copied Authorization and Cookie values', () => {
    const result = getOkxC2cPlugin().handle({
      ...request('GET', '/v4/c2c/order/getOrderList', { orderType: 'pending' }),
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
        orderDetailUserVo: {
          realName: '测试用户',
          kycVerified: true,
          sellerReceiptAccount: { id: '25990076' },
        },
      },
    })

    getOkxC2cState().updateSettings({ antiFraudReview: true })
    const risk = getOkxC2cPlugin().handle(request('GET', '/v4/c2c/risk/antiFraudPopup/info'))
    expect(risk.body).toMatchObject({ code: 0, data: { shouldShowPopup: true, isShowPopup: true } })
  })

  it('marks payment and transitions the order to paid', () => {
    const result = getOkxC2cPlugin().handle({
      ...request(
        'POST',
        '/v3/c2c/orders/260905000000001/payment/paid',
        {},
        { receiptAccountId: 25990076 },
      ),
      headers: headers(true),
    })
    expect(result.body).toMatchObject({ code: 0 })
    expect(getOkxC2cState().orders.find('260905000000001')).toMatchObject({
      orderStatus: 'new',
      orderProcessStatus: 2,
      paymentStatus: 'paid',
    })
  })

  it('uploads a payment proof and accepts only a valid EC signature', () => {
    const path = '/v3/c2c/orders/260905000000001/payment/paid'
    const body = {
      receiptAccountId: 25990076,
      paymentProofFileUrls: ['/mock/payment-proof/receipt.jpg'],
    }
    const timestamp = String(Date.now())
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    getOkxC2cState().updateSettings({
      signaturePublicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    })
    const upload = getOkxC2cPlugin().handle(
      request('POST', '/v3/c2c/files/', { type: 'paymentProof' }, {
        file: { filename: 'receipt.jpg', type: 'image/jpeg', size: 128 },
      }),
    )
    expect(upload.body).toMatchObject({
      code: 0,
      data: { imgPath: '/mock/payment-proof/receipt.jpg' },
    })

    const validSignature = sign(
      'sha256',
      Buffer.from(`${path}${JSON.stringify(body)}${timestamp}`),
      { key: privateKey, dsaEncoding: 'ieee-p1363' },
    ).toString('base64')
    const signedHeaders = new Headers({
      Authorization: 'Bearer mock-okx-authorization',
      Cookie: 'token=mock-okx-token; sid=mock-okx-session',
      'x-request-timestamp': timestamp,
      'x-client-signature': `{P1363}${validSignature}`,
      'x-client-signature-version': '1.3',
    })
    const invalid = getOkxC2cPlugin().handle({
      ...request('POST', path, {}, body),
      headers: new Headers({
        ...Object.fromEntries(signedHeaders),
        'x-client-signature': '{P1363}invalid',
      }),
    })
    expect(invalid.body).toMatchObject({ code: '400011', error_message: '客户端签名无效' })

    const valid = getOkxC2cPlugin().handle({
      ...request('POST', path, {}, body),
      headers: signedHeaders,
    })
    expect(valid.body).toMatchObject({ code: 0 })
  })

  it('rejects an empty or unsupported payment proof upload', () => {
    const empty = getOkxC2cPlugin().handle(
      request('POST', '/v3/c2c/files/', { type: 'paymentProof' }, {
        file: { filename: 'receipt.jpg', type: 'image/jpeg', size: 0 },
      }),
    )
    expect(empty.body).toMatchObject({ code: '400012' })
    const unsupported = getOkxC2cPlugin().handle(
      request('POST', '/v3/c2c/files/', { type: 'paymentProof' }, {
        file: { filename: 'receipt.txt', type: 'text/plain', size: 10 },
      }),
    )
    expect(unsupported.body).toMatchObject({ code: '400013' })
  })

  it('rejects an incorrect account and supports deterministic failures', () => {
    const badAccount = getOkxC2cPlugin().handle({
      ...request(
        'POST',
        '/v3/c2c/orders/260905000000001/payment/paid',
        {},
        { receiptAccountId: 1 },
      ),
      headers: headers(true),
    })
    expect(badAccount.body).toMatchObject({ code: '400004' })
    getOkxC2cState().updateSettings({ markOrderAsPaidFailure: true })
    const failed = getOkxC2cPlugin().handle({
      ...request(
        'POST',
        '/v3/c2c/orders/260905000000001/payment/paid',
        {},
        { receiptAccountId: 25990076 },
      ),
      headers: headers(true),
    })
    expect(failed.body).toMatchObject({ code: '400003' })
  })
})
