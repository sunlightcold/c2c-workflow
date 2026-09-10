import {
  BusinessStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentAdapterCode,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { C2cBuyOrderStatus } from '../c2c-platform'
import {
  C2cPaymentPreflightVerifier,
  type PaymentPreflightStore,
} from './c2c-payment-preflight-verifier'
import { PaymentNotSubmittedError } from './payment-execution-coordinator'

describe('C2cPaymentPreflightVerifier', () => {
  const now = new Date('2026-09-10T08:00:00.000Z')
  const order = {
    id: 'payment-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    sourceType: PaymentSourceType.C2C_BUY,
    sourceBusinessNo: 'platform-order-1',
    paymentNo: 'PAY001',
    amount: '100.00',
    currency: 'CNY',
    paymentMethod: 'ALIPAY',
    executionMode: PaymentExecutionMode.INSTANT,
    payeeIdentity: 'payee@example.com',
    payeeName: '张三',
    paymentPlanId: 'plan-1',
    paymentAccountId: 'account-1',
    paymentAccountChannelId: 'account-channel-1',
    status: PaymentOrderStatus.SUBMITTING,
  }
  const configuration = {
    merchant: {
      id: 'merchant-1',
      tenantId: 'tenant-1',
      platform: MerchantPlatform.BINANCE,
      status: BusinessStatus.ACTIVE,
    },
    merchantOrder: {
      id: 'merchant-order-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      platform: MerchantPlatform.BINANCE,
      platformOrderId: 'platform-order-1',
      status: MerchantOrderStatus.PENDING_PAYMENT,
      payable: true,
      fiatAmount: '100.00',
      fiatCurrency: 'CNY',
      paymentMethod: 'ALIPAY',
      platformPaymentMethodId: '901',
      payeeIdentity: 'payee@example.com',
      payeeName: '张三',
      paymentDeadline: new Date('2026-09-10T08:05:00.000Z'),
    },
    credential: {
      platform: MerchantPlatform.BINANCE,
      credentialRef: 'env://BINANCE_TEST',
      clientType: 'WEB',
      xUserId: null,
      requestTimeoutMs: 5000,
      status: BusinessStatus.ACTIVE,
    },
    plan: {
      id: 'plan-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      paymentAccountId: 'account-1',
      paymentAccountChannelId: 'account-channel-1',
      status: BusinessStatus.ACTIVE,
    },
    account: {
      id: 'account-1',
      tenantId: 'tenant-1',
      platformId: 'payment-platform-1',
      credentialRef: 'env://ALIPAY_ACCOUNT_1',
      status: BusinessStatus.ACTIVE,
    },
    accountChannel: {
      id: 'account-channel-1',
      paymentAccountId: 'account-1',
      channelId: 'channel-1',
      status: BusinessStatus.ACTIVE,
    },
    channel: {
      id: 'channel-1',
      platformId: 'payment-platform-1',
      adapterCode: PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER,
      executionMode: PaymentExecutionMode.INSTANT,
      status: BusinessStatus.ACTIVE,
    },
    paymentPlatform: {
      id: 'payment-platform-1',
      code: 'ALIPAY',
      status: BusinessStatus.ACTIVE,
    },
  }
  const platformOrder = {
    platformOrderId: 'platform-order-1',
    side: 'BUY' as const,
    status: C2cBuyOrderStatus.PENDING_PAYMENT,
    asset: 'USDT',
    assetAmount: '10',
    fiatCurrency: 'CNY',
    fiatAmount: '100.00',
    platformPaymentMethodId: '901',
    paymentMethod: 'ALIPAY',
    payeeIdentity: 'payee@example.com',
    payeeName: '张三',
    identityName: '张三',
    payable: true,
    paymentDeadline: '2026-09-10T08:05:00.000Z',
    createdAt: '2026-09-10T07:50:00.000Z',
  }
  const store: jest.Mocked<PaymentPreflightStore> = { load: jest.fn() }
  const secretResolver = { resolve: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const binance = { getOrderDetail: jest.fn() }
  const okx = { getOrderDetail: jest.fn() }
  let verifier: C2cPaymentPreflightVerifier

  beforeEach(() => {
    jest.clearAllMocks()
    store.load.mockResolvedValue({ order, ...configuration })
    secretResolver.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentialFactory.create.mockReturnValue({
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
    })
    binance.getOrderDetail.mockResolvedValue(platformOrder)
    verifier = new C2cPaymentPreflightVerifier(
      store,
      secretResolver,
      credentialFactory as never,
      binance as never,
      okx as never,
    )
  })

  it('accepts an unchanged payable platform order on an active instant Alipay route', async () => {
    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order,
      platformOrder: {
        platformOrderId: 'platform-order-1',
        platformPaymentMethodId: '901',
      },
    })
    expect(store.load).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(binance.getOrderDetail).toHaveBeenCalledTimes(1)
    expect(okx.getOrderDetail).not.toHaveBeenCalled()
  })

  it('reads an OKX order with the active merchant credential', async () => {
    const okxConfiguration = {
      ...configuration,
      merchant: { ...configuration.merchant, platform: MerchantPlatform.OKX },
      merchantOrder: { ...configuration.merchantOrder, platform: MerchantPlatform.OKX },
      credential: {
        ...configuration.credential,
        platform: MerchantPlatform.OKX,
        clientType: null,
      },
    }
    store.load.mockResolvedValue({ order, ...okxConfiguration })
    secretResolver.resolve.mockResolvedValue({ cookie: 'cookie', authorization: 'authorization' })
    credentialFactory.create.mockReturnValue({
      cookie: 'cookie',
      authorization: 'authorization',
      timeoutMs: 5000,
    })
    okx.getOrderDetail.mockResolvedValue(platformOrder)

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      platformOrder: { platformOrderId: 'platform-order-1' },
    })
    expect(okx.getOrderDetail).toHaveBeenCalledWith(
      { cookie: 'cookie', authorization: 'authorization', timeoutMs: 5000 },
      'platform-order-1',
    )
    expect(binance.getOrderDetail).not.toHaveBeenCalled()
  })

  it('classifies an unavailable platform secret as definitely not submitted', async () => {
    secretResolver.resolve.mockRejectedValue(new Error('Secret 引用未配置'))

    await expect(verifier.verify('tenant-1', 'payment-1', now)).rejects.toEqual(
      new PaymentNotSubmittedError('Secret 引用未配置'),
    )
    expect(binance.getOrderDetail).not.toHaveBeenCalled()
  })

  it.each([
    ['platform status changed', { status: C2cBuyOrderStatus.CANCELLED }, '平台订单已不可付款'],
    ['amount changed', { fiatAmount: '101.00' }, '平台订单金额已变化'],
    ['payee changed', { payeeIdentity: 'other@example.com' }, '平台订单收款账号已变化'],
    ['payment method changed', { platformPaymentMethodId: '902' }, '平台付款方式已变化'],
    ['deadline missing', { paymentDeadline: undefined }, '平台订单缺少明确付款截止时间'],
    [
      'deadline passed',
      { paymentDeadline: '2026-09-10T07:59:59.000Z' },
      '平台订单付款截止时间已变化',
    ],
  ])('rejects before payment when %s', async (_case, change, message) => {
    binance.getOrderDetail.mockResolvedValue({ ...platformOrder, ...change })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).rejects.toEqual(
      new PaymentNotSubmittedError(message),
    )
  })

  it('rejects when the locked route is no longer the instant merchant-transfer channel', async () => {
    store.load.mockResolvedValue({
      order,
      ...configuration,
      channel: { ...configuration.channel, adapterCode: PaymentAdapterCode.ALIPAY_BATCH },
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).rejects.toEqual(
      new PaymentNotSubmittedError('支付通道不支持即时商家转账'),
    )
    expect(binance.getOrderDetail).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the stored deadline is missing',
      { merchantOrder: { ...configuration.merchantOrder, paymentDeadline: null } },
      '商家订单缺少明确付款截止时间',
    ],
    [
      'the stored deadline has passed',
      {
        merchantOrder: {
          ...configuration.merchantOrder,
          paymentDeadline: new Date('2026-09-10T07:59:59.000Z'),
        },
      },
      '商家订单付款截止时间已过',
    ],
    [
      'the payment account is disabled',
      { account: { ...configuration.account, status: BusinessStatus.DISABLED } },
      '支付账号已停用',
    ],
  ])('does not contact the platform when %s', async (_case, change, message) => {
    store.load.mockResolvedValue({ order, ...configuration, ...change })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).rejects.toEqual(
      new PaymentNotSubmittedError(message),
    )
    expect(binance.getOrderDetail).not.toHaveBeenCalled()
    expect(okx.getOrderDetail).not.toHaveBeenCalled()
  })
})
