import { MemoryRepository } from '@mock/core/memory-repository'
import { createDemoAds } from '../c2c-ad/demo-ads'
import type { C2cMockAd } from '../c2c-ad/mock-ad'
import type { OkxC2cMockOrder, OkxC2cSettings } from './types'

const DEFAULT_SETTINGS: OkxC2cSettings = {
  authorization: process.env.MOCK_OKX_AUTHORIZATION ?? 'Bearer mock-okx-authorization',
  cookie: process.env.MOCK_OKX_COOKIE ?? 'token=mock-okx-token; sid=mock-okx-session',
  signaturePublicKey: process.env.MOCK_OKX_SIGNATURE_PUBLIC_KEY,
  antiFraudReview: false,
  markOrderAsPaidFailure: false,
}

function defaultOrder(): OkxC2cMockOrder {
  const now = Date.now()
  return {
    id: '260905000000001',
    publicTradingOrderId: '260905000000001-trading',
    side: 'buy',
    orderStatus: 'new',
    orderProcessStatus: 2,
    paymentStatus: 'unpaid',
    baseAmount: '10.00',
    baseCurrency: 'usdt',
    quoteAmount: '70.00',
    quoteCurrency: 'cny',
    price: '7.00',
    createdDate: now,
    modifyDate: now,
    orderPaidDate: null,
    receiptAccountId: '25990076',
    sellerReceiptAccount: {
      id: '25990076',
      accountName: '测试用户',
      accountNo: '13800138000',
      type: 'aliPay',
      paymentDescription: '支付宝',
      bankCode: 'ALIPAY',
    },
    detailUser: { realName: '测试用户', kycVerified: true, nickName: 'mock-user' },
  }
}

export class OkxC2cState {
  readonly orders = new MemoryRepository<OkxC2cMockOrder>()
  readonly ads = new MemoryRepository<C2cMockAd>()
  private settings = { ...DEFAULT_SETTINGS }

  constructor() {
    this.orders.insert(defaultOrder())
    this.resetAds()
  }

  resetAds() {
    this.ads.clear()
    for (const ad of createDemoAds('OKX')) this.ads.insert(ad)
    return { ads: this.ads.list().length }
  }

  getSettings() {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<OkxC2cSettings>) {
    this.settings = { ...this.settings, ...patch }
    return this.getSettings()
  }

  reset() {
    const deletedOrders = this.orders.clear()
    this.resetAds()
    this.settings = { ...DEFAULT_SETTINGS }
    this.orders.insert(defaultOrder())
    return { deletedOrders, settings: this.getSettings(), orders: this.orders.list() }
  }
}

const stateKey = Symbol.for('to-pay.mock.okx-c2c.state')

export function getOkxC2cState() {
  const globals = globalThis as typeof globalThis & { [stateKey]?: OkxC2cState }
  globals[stateKey] ??= new OkxC2cState()
  return globals[stateKey]
}
