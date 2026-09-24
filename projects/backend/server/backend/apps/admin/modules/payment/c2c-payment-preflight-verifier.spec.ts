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
      status: MerchantOrderStatus.PAYMENT_PROCESSING,
      payable: true,
      fiatAmount: '100.00',
      fiatCurrency: 'CNY',
      asset: 'USDT',
      paymentMethod: 'ALIPAY',
      platformPaymentMethodId: '901',
      payeeIdentity: 'payee@example.com',
      payeeName: '张三',
      identityName: '张三',
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
  const platformClient = { getOrderDetail: jest.fn() }
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
    platformClient.getOrderDetail.mockResolvedValue(platformOrder)
    verifier = new C2cPaymentPreflightVerifier(
      store,
      secretResolver,
      credentialFactory as never,
      platformClient as never,
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
    expect(platformClient.getOrderDetail).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      expect.any(Object),
      'platform-order-1',
    )
  })

  it('accepts an unchanged instant amount with trailing upstream zeros', async () => {
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      fiatAmount: '100.00000000',
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      platformOrder: { fiatAmount: '100.00000000' },
    })
  })

  it('accepts a synced merchant amount with trailing zeros', async () => {
    store.load.mockResolvedValue({
      order,
      ...configuration,
      merchantOrder: { ...configuration.merchantOrder, fiatAmount: '100.00000000' },
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order,
    })
  })

  it('accepts an unchanged payable platform order before an Alipay password-protected batch claim', async () => {
    const batchOrder = {
      ...order,
      status: PaymentOrderStatus.READY,
      executionMode: PaymentExecutionMode.BATCH,
    }
    store.load.mockResolvedValue({
      order: batchOrder,
      ...configuration,
      merchantOrder: {
        ...configuration.merchantOrder,
        status: MerchantOrderStatus.PENDING_PAYMENT,
      },
      channel: {
        ...configuration.channel,
        adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
        executionMode: PaymentExecutionMode.BATCH,
      },
    })

    await expect(verifier.verifyBatch('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order: batchOrder,
      platformOrder: { platformOrderId: 'platform-order-1' },
    })
  })

  it.each(['100', '100.0', '100.00000000'])(
    'accepts an unchanged batch amount with upstream format %s',
    async (fiatAmount) => {
      store.load.mockResolvedValue({
        order: {
          ...order,
          status: PaymentOrderStatus.READY,
          executionMode: PaymentExecutionMode.BATCH,
        },
        ...configuration,
        merchantOrder: {
          ...configuration.merchantOrder,
          status: MerchantOrderStatus.PENDING_PAYMENT,
        },
        channel: {
          ...configuration.channel,
          adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
          executionMode: PaymentExecutionMode.BATCH,
        },
      })
      platformClient.getOrderDetail.mockResolvedValue({ ...platformOrder, fiatAmount })

      await expect(verifier.verifyBatch('tenant-1', 'payment-1', now)).resolves.toMatchObject({
        platformOrder: { fiatAmount },
      })
    },
  )

  it.each(['100.001', '100.01000000', '101.00000000'])(
    'rejects a real batch amount difference with upstream format %s',
    async (fiatAmount) => {
      store.load.mockResolvedValue({
        order: {
          ...order,
          status: PaymentOrderStatus.READY,
          executionMode: PaymentExecutionMode.BATCH,
        },
        ...configuration,
        merchantOrder: {
          ...configuration.merchantOrder,
          status: MerchantOrderStatus.PENDING_PAYMENT,
        },
        channel: {
          ...configuration.channel,
          adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
          executionMode: PaymentExecutionMode.BATCH,
        },
      })
      platformClient.getOrderDetail.mockResolvedValue({ ...platformOrder, fiatAmount })

      await expect(verifier.verifyBatch('tenant-1', 'payment-1', now)).rejects.toEqual(
        new PaymentNotSubmittedError('平台订单金额已变化'),
      )
    },
  )

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
    platformClient.getOrderDetail.mockResolvedValue(platformOrder)

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      platformOrder: { platformOrderId: 'platform-order-1' },
    })
    expect(platformClient.getOrderDetail).toHaveBeenCalledWith(
      MerchantPlatform.OKX,
      { cookie: 'cookie', authorization: 'authorization', timeoutMs: 5000 },
      'platform-order-1',
    )
  })

  it('classifies an unavailable platform secret as definitely not submitted', async () => {
    secretResolver.resolve.mockRejectedValue(new Error('Secret 引用未配置'))

    await expect(verifier.verify('tenant-1', 'payment-1', now)).rejects.toEqual(
      new PaymentNotSubmittedError('Secret 引用未配置'),
    )
    expect(platformClient.getOrderDetail).not.toHaveBeenCalled()
  })

  it.each([
    ['platform status changed', { status: C2cBuyOrderStatus.CANCELLED }, '平台订单已不可付款'],
    ['amount changed', { fiatAmount: '101.00' }, '平台订单金额已变化'],
    ['payment method changed', { paymentMethod: 'BANK' }, '平台订单付款方式已变化'],
  ])('rejects before payment when %s', async (_case, change, message) => {
    platformClient.getOrderDetail.mockResolvedValue({ ...platformOrder, ...change })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).rejects.toEqual(
      new PaymentNotSubmittedError(message),
    )
  })

  it('allows a name mismatch while retaining the money and payment method checks', async () => {
    store.load.mockResolvedValue({
      order: { ...order, payeeName: '收款人姓名' },
      ...configuration,
      merchantOrder: {
        ...configuration.merchantOrder,
        payeeName: '收款人姓名',
        identityName: '平台实名',
      },
    })
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      payeeName: '收款人姓名',
      identityName: '平台实名',
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order: { payeeName: '收款人姓名' },
      platformOrder: { identityName: '平台实名' },
    })
  })

  it('allows a name mismatch for the batch payment channel', async () => {
    store.load.mockResolvedValue({
      order: {
        ...order,
        status: PaymentOrderStatus.READY,
        executionMode: PaymentExecutionMode.BATCH,
        payeeName: '收款人姓名',
      },
      ...configuration,
      merchantOrder: {
        ...configuration.merchantOrder,
        status: MerchantOrderStatus.PENDING_PAYMENT,
        payeeName: '收款人姓名',
        identityName: '平台实名',
      },
      channel: {
        ...configuration.channel,
        adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
        executionMode: PaymentExecutionMode.BATCH,
      },
    })
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      payeeName: '收款人姓名',
      identityName: '平台实名',
    })

    await expect(verifier.verifyBatch('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order: { payeeName: '收款人姓名' },
    })
  })

  it('does not block submission when the recipient display name changes', async () => {
    store.load.mockResolvedValue({
      order: { ...order, payeeName: '支付单收款人' },
      ...configuration,
      merchantOrder: { ...configuration.merchantOrder, payeeName: '最新收款人' },
    })
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      payeeName: '平台最新收款人',
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order: { payeeName: '支付单收款人' },
      platformOrder: { payeeName: '平台最新收款人' },
    })
  })

  it('does not block a batch when the merchant order recipient account changes after payment creation', async () => {
    store.load.mockResolvedValue({
      order: {
        ...order,
        status: PaymentOrderStatus.READY,
        executionMode: PaymentExecutionMode.BATCH,
      },
      ...configuration,
      merchantOrder: {
        ...configuration.merchantOrder,
        status: MerchantOrderStatus.PENDING_PAYMENT,
        payeeIdentity: 'latest-payee@example.com',
      },
      channel: {
        ...configuration.channel,
        adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
        executionMode: PaymentExecutionMode.BATCH,
      },
    })

    await expect(verifier.verifyBatch('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order: { payeeIdentity: 'payee@example.com' },
    })
  })

  it('does not block a batch when the platform returns a changed recipient account', async () => {
    store.load.mockResolvedValue({
      order: {
        ...order,
        status: PaymentOrderStatus.READY,
        executionMode: PaymentExecutionMode.BATCH,
      },
      ...configuration,
      merchantOrder: {
        ...configuration.merchantOrder,
        status: MerchantOrderStatus.PENDING_PAYMENT,
      },
      channel: {
        ...configuration.channel,
        adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
        executionMode: PaymentExecutionMode.BATCH,
      },
    })
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      payeeIdentity: 'latest-payee@example.com',
    })

    await expect(verifier.verifyBatch('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order: { payeeIdentity: 'payee@example.com' },
      platformOrder: { payeeIdentity: 'latest-payee@example.com' },
    })
  })

  it('accepts a changed platform real name and refreshed payment method id', async () => {
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      asset: 'BTC',
      identityName: '张 三',
      platformPaymentMethodId: '902',
      paymentMethod: 'aliPay',
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      platformOrder: { platformPaymentMethodId: '902' },
    })
  })

  it('allows payment when Binance does not provide a payment deadline', async () => {
    store.load.mockResolvedValue({
      order,
      ...configuration,
      merchantOrder: { ...configuration.merchantOrder, paymentDeadline: null },
    })
    platformClient.getOrderDetail.mockResolvedValue({
      ...platformOrder,
      paymentDeadline: undefined,
    })

    await expect(verifier.verify('tenant-1', 'payment-1', now)).resolves.toMatchObject({
      order,
      platformOrder: expect.objectContaining({ paymentDeadline: undefined }),
    })
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
    expect(platformClient.getOrderDetail).not.toHaveBeenCalled()
  })

  it.each([
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
    expect(platformClient.getOrderDetail).not.toHaveBeenCalled()
  })
})
