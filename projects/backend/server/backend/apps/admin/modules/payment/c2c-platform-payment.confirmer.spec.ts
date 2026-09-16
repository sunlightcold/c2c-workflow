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
  C2cPlatformPaymentConfirmer,
  type PlatformConfirmationStore,
} from './c2c-platform-payment.confirmer'
import { PlatformFundsExceptionError } from './payment-execution.errors'
import { Logger } from '@nestjs/common'

describe('C2cPlatformPaymentConfirmer', () => {
  const executable = {
    id: 'payment-1',
    tenantId: 'tenant-1',
    status: PaymentOrderStatus.SUCCESS,
    upstreamId: 'ALIPAY-1',
  }
  const pendingPlatformOrder = {
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
    createdAt: '2026-09-10T07:00:00.000Z',
  }
  const context = {
    order: {
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
      status: PaymentOrderStatus.SUCCESS,
    },
    merchant: {
      id: 'merchant-1',
      tenantId: 'tenant-1',
      code: 'MCH-OKX-1',
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
      paymentDeadline: new Date('2026-09-10T09:00:00.000Z'),
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
      credentialRef: 'env://ALIPAY_TEST',
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
    paymentPlatform: { id: 'payment-platform-1', code: 'ALIPAY', status: BusinessStatus.ACTIVE },
  }
  const store: jest.Mocked<PlatformConfirmationStore> = {
    load: jest.fn(),
    transitionMerchantOrder: jest.fn(),
  }
  const secretResolver = { resolve: jest.fn() }
  const credentials = { create: jest.fn() }
  const platformClient = {
    getOrderDetail: jest.fn(),
    markOrderAsPaid: jest.fn(),
    getMarkPaidPolicy: jest.fn(),
  }
  const paymentProofs = { load: jest.fn() }
  const throttle = { execute: jest.fn((_merchant, task) => task()) }
  const platformChat = { sendOrderPaid: jest.fn(), sendOrderCompleted: jest.fn() }
  let confirmer: C2cPlatformPaymentConfirmer

  beforeEach(() => {
    jest.clearAllMocks()
    store.load.mockResolvedValue(context)
    store.transitionMerchantOrder.mockResolvedValue(undefined)
    secretResolver.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentials.create.mockReturnValue({
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
    })
    platformClient.getMarkPaidPolicy.mockReturnValue({ paymentProof: 'NONE' })
    platformClient.getOrderDetail.mockReset()
    platformClient.getOrderDetail.mockResolvedValue(pendingPlatformOrder)
    platformClient.markOrderAsPaid.mockResolvedValue(undefined)
    platformChat.sendOrderPaid.mockResolvedValue(undefined)
    platformChat.sendOrderCompleted.mockResolvedValue(undefined)
    confirmer = new C2cPlatformPaymentConfirmer(
      store,
      secretResolver,
      credentials as never,
      platformClient as never,
      paymentProofs as never,
      throttle as never,
      platformChat as never,
    )
  })

  it('accepts a successful Binance mark-paid response without waiting for an immediate status refresh', async () => {
    await expect(confirmer.confirmPaid(executable)).resolves.toBeUndefined()

    expect(platformClient.markOrderAsPaid).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      expect.objectContaining({ apiKey: 'key' }),
      'platform-order-1',
      '901',
      undefined,
    )
    expect(platformClient.getOrderDetail).not.toHaveBeenCalled()
    expect(platformChat.sendOrderPaid).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'merchant-order-1',
    )
    expect(store.transitionMerchantOrder.mock.calls).toEqual([
      [
        'tenant-1',
        'merchant-order-1',
        MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
        C2cBuyOrderStatus.PENDING_PAYMENT,
      ],
      ['tenant-1', 'merchant-order-1', MerchantOrderStatus.PENDING_RELEASE, C2cBuyOrderStatus.PAID],
    ])
  })

  it('logs the full merchant-order-payment relationship without credentials', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    await confirmer.confirmPaid({
      ...executable,
      batchId: 'batch-1',
      batchNo: 'BAT-1',
      batchUpstreamId: 'alipay-batch-1',
    })

    const messages = log.mock.calls.map(([message]) => String(message)).join('\n')
    expect(messages).toContain('merchantCode=MCH-OKX-1')
    expect(messages).toContain('merchantOrderId=merchant-order-1')
    expect(messages).toContain('platformOrderId=platform-order-1')
    expect(messages).toContain('paymentOrderId=payment-1')
    expect(messages).toContain('paymentNo=PAY001')
    expect(messages).toContain('paymentUpstreamId=ALIPAY-1')
    expect(messages).toContain('batchNo=BAT-1')
    expect(messages).not.toContain('secret')
    expect(messages).not.toContain('authorization')
  })

  it('finishes platform confirmation after the merchant is disabled', async () => {
    store.load.mockResolvedValue({
      ...context,
      merchant: { ...context.merchant, status: BusinessStatus.DISABLED },
    })

    await expect(confirmer.confirmPaid(executable)).resolves.toBeUndefined()

    expect(platformClient.markOrderAsPaid).toHaveBeenCalledTimes(1)
    expect(store.transitionMerchantOrder).toHaveBeenLastCalledWith(
      'tenant-1',
      'merchant-order-1',
      MerchantOrderStatus.PENDING_RELEASE,
      C2cBuyOrderStatus.PAID,
    )
  })

  it('marks an OKX order as paid without a receipt when its policy skips proof upload', async () => {
    const okxContext = {
      ...context,
      merchant: { ...context.merchant, platform: MerchantPlatform.OKX },
      merchantOrder: { ...context.merchantOrder, platform: MerchantPlatform.OKX },
      credential: { ...context.credential, platform: MerchantPlatform.OKX, clientType: null },
    }
    store.load.mockResolvedValue(okxContext)
    secretResolver.resolve.mockResolvedValue({ cookie: 'cookie', authorization: 'authorization' })
    credentials.create.mockReturnValue({
      cookie: 'cookie',
      authorization: 'authorization',
      signaturePrivateKey: 'private-key',
      timeoutMs: 5000,
    })
    platformClient.getMarkPaidPolicy.mockReturnValue({ paymentProof: 'SKIP' })
    platformClient.getOrderDetail.mockReset()
    platformClient.getOrderDetail.mockResolvedValue({
      ...pendingPlatformOrder,
      status: C2cBuyOrderStatus.PAID,
      payable: false,
    })
    await confirmer.confirmPaid(executable)

    expect(paymentProofs.load).not.toHaveBeenCalled()
    expect(platformClient.markOrderAsPaid).toHaveBeenCalledWith(
      MerchantPlatform.OKX,
      expect.objectContaining({ cookie: 'cookie' }),
      'platform-order-1',
      '901',
      {
        fiat: 'CNY',
        skipPaymentProofUpload: true,
      },
    )
  })

  it('loads and uploads an OKX receipt when its policy requires proof', async () => {
    const okxContext = {
      ...context,
      merchant: { ...context.merchant, platform: MerchantPlatform.OKX },
      merchantOrder: { ...context.merchantOrder, platform: MerchantPlatform.OKX },
      credential: { ...context.credential, platform: MerchantPlatform.OKX, clientType: null },
    }
    const paymentProofImage = {
      content: Buffer.from('receipt-jpeg'),
      fileName: 'platform-order-1-1.jpg',
      imageType: 'jpeg' as const,
      width: 800,
      height: 1200,
    }
    store.load.mockResolvedValue(okxContext)
    secretResolver.resolve.mockResolvedValue({
      cookie: 'cookie',
      authorization: 'authorization',
      signaturePrivateKey: 'private-key',
      skipPaymentProofUpload: false,
    })
    credentials.create.mockReturnValue({
      cookie: 'cookie',
      authorization: 'authorization',
      signaturePrivateKey: 'private-key',
      skipPaymentProofUpload: false,
      timeoutMs: 5000,
    })
    paymentProofs.load.mockResolvedValue([paymentProofImage])
    platformClient.getMarkPaidPolicy.mockReturnValue({ paymentProof: 'REQUIRED' })
    platformClient.getOrderDetail.mockReset()
    platformClient.getOrderDetail.mockResolvedValue({
      ...pendingPlatformOrder,
      status: C2cBuyOrderStatus.PAID,
      payable: false,
    })
    await expect(confirmer.confirmPaid(executable)).resolves.toBeUndefined()

    expect(paymentProofs.load).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      paymentOrderId: 'payment-1',
      platformOrderId: 'platform-order-1',
    })
    expect(platformClient.markOrderAsPaid).toHaveBeenCalledWith(
      MerchantPlatform.OKX,
      expect.objectContaining({ cookie: 'cookie' }),
      'platform-order-1',
      '901',
      {
        fiat: 'CNY',
        skipPaymentProofUpload: false,
        paymentProofImages: [paymentProofImage],
      },
    )
  })

  it('keeps an OKX order pending when its required receipt is not ready', async () => {
    const okxContext = {
      ...context,
      merchant: { ...context.merchant, platform: MerchantPlatform.OKX },
      merchantOrder: { ...context.merchantOrder, platform: MerchantPlatform.OKX },
      credential: { ...context.credential, platform: MerchantPlatform.OKX, clientType: null },
    }
    store.load.mockResolvedValue(okxContext)
    credentials.create.mockReturnValue({
      cookie: 'cookie',
      authorization: 'authorization',
      signaturePrivateKey: 'private-key',
      skipPaymentProofUpload: false,
      timeoutMs: 5000,
    })
    paymentProofs.load.mockRejectedValue(new Error('付款回单暂不可用：回单生成中'))
    platformClient.getMarkPaidPolicy.mockReturnValue({ paymentProof: 'REQUIRED' })

    await expect(confirmer.confirmPaid(executable)).rejects.toThrow('付款回单暂不可用：回单生成中')

    expect(paymentProofs.load).toHaveBeenCalledTimes(1)
    expect(platformClient.markOrderAsPaid).not.toHaveBeenCalled()
  })

  it('rejects the legacy mixed payment state as a platform confirmation input', async () => {
    store.load.mockResolvedValue({
      ...context,
      order: { ...context.order, status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING },
    })

    await expect(confirmer.confirmPaid(executable)).rejects.toThrow('支付订单未处于平台确认阶段')
    expect(platformClient.getOrderDetail).not.toHaveBeenCalled()
    expect(platformClient.markOrderAsPaid).not.toHaveBeenCalled()
  })

  it('keeps an OKX order pending when its post-submit status refresh is delayed', async () => {
    store.load.mockResolvedValue({
      ...context,
      merchant: { ...context.merchant, platform: MerchantPlatform.OKX },
      merchantOrder: {
        ...context.merchantOrder,
        platform: MerchantPlatform.OKX,
        status: MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      },
      credential: { ...context.credential, platform: MerchantPlatform.OKX, clientType: null },
    })
    credentials.create.mockReturnValue({
      cookie: 'cookie',
      authorization: 'authorization',
      signaturePrivateKey: 'private-key',
      timeoutMs: 5000,
    })
    platformClient.getMarkPaidPolicy.mockReturnValue({ paymentProof: 'SKIP' })
    platformClient.getOrderDetail.mockReset()
    platformClient.getOrderDetail
      .mockResolvedValueOnce(pendingPlatformOrder)
      .mockResolvedValueOnce(pendingPlatformOrder)

    await expect(confirmer.confirmPaid(executable)).rejects.toThrow('平台尚未确认已付款')
    expect(store.transitionMerchantOrder).toHaveBeenCalledTimes(1)
  })

  it.each([C2cBuyOrderStatus.CANCELLED, C2cBuyOrderStatus.EXPIRED, C2cBuyOrderStatus.DISPUTED])(
    'moves a paid order to funds exception when platform status is %s',
    async (status) => {
      platformClient.getOrderDetail.mockReset()
      store.load.mockResolvedValue({
        ...context,
        merchantOrder: {
          ...context.merchantOrder,
          status: MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
        },
      })
      platformClient.getOrderDetail.mockResolvedValue({
        ...pendingPlatformOrder,
        status,
        payable: false,
      })

      await expect(confirmer.confirmPaid(executable)).rejects.toBeInstanceOf(
        PlatformFundsExceptionError,
      )
      expect(platformClient.markOrderAsPaid).not.toHaveBeenCalled()
      expect(store.transitionMerchantOrder).toHaveBeenLastCalledWith(
        'tenant-1',
        'merchant-order-1',
        MerchantOrderStatus.FUNDS_EXCEPTION,
        status,
      )
    },
  )

  it('does not block Binance mark-paid on mutable receipt metadata after Alipay succeeded', async () => {
    store.load.mockResolvedValue({
      ...context,
      merchantOrder: {
        ...context.merchantOrder,
        status: MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      },
    })
    platformClient.getOrderDetail.mockReset()
    platformClient.getOrderDetail.mockResolvedValue({
      ...pendingPlatformOrder,
      platformPaymentMethodId: '902',
      payeeIdentity: 'formatted-account',
      payeeName: '张 三',
    })

    await expect(confirmer.confirmPaid(executable)).resolves.toBeUndefined()
    expect(platformClient.markOrderAsPaid).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      expect.anything(),
      'platform-order-1',
      '902',
      undefined,
    )
  })

  it('only queries during stale-worker recovery and leaves a pending platform order for manual retry', async () => {
    store.load.mockResolvedValue({
      ...context,
      merchantOrder: {
        ...context.merchantOrder,
        status: MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      },
    })
    platformClient.getOrderDetail.mockResolvedValue(pendingPlatformOrder)

    await expect(confirmer.confirmPaid(executable, { queryOnly: true })).rejects.toThrow(
      '平台订单仍待付款，请人工重试标记付款',
    )
    expect(platformClient.getOrderDetail).toHaveBeenCalledTimes(1)
    expect(platformClient.markOrderAsPaid).not.toHaveBeenCalled()
  })
})
