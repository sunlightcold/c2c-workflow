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

describe('C2cPlatformPaymentConfirmer', () => {
  const executable = {
    id: 'payment-1',
    tenantId: 'tenant-1',
    status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
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
      status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
    },
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
      paymentMethod: 'ALIPAY',
      platformPaymentMethodId: '901',
      payeeIdentity: 'payee@example.com',
      payeeName: '张三',
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
  const binance = { getOrderDetail: jest.fn(), markOrderAsPaid: jest.fn() }
  const okx = {
    getOrderDetail: jest.fn(),
    checkAntiFraud: jest.fn(),
    markOrderAsPaid: jest.fn(),
  }
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
    binance.getOrderDetail.mockResolvedValueOnce(pendingPlatformOrder).mockResolvedValueOnce({
      ...pendingPlatformOrder,
      status: C2cBuyOrderStatus.PAID,
      payable: false,
    })
    binance.markOrderAsPaid.mockResolvedValue(undefined)
    confirmer = new C2cPlatformPaymentConfirmer(
      store,
      secretResolver,
      credentials as never,
      binance as never,
      okx as never,
    )
  })

  it('marks a Binance order paid with its numeric platform payment method and verifies the result', async () => {
    await expect(confirmer.confirmPaid(executable)).resolves.toBeUndefined()

    expect(binance.markOrderAsPaid).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'key' }),
      'platform-order-1',
      901,
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

  it('marks an OKX order paid with its receipt account id after anti-fraud clearance', async () => {
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
      timeoutMs: 5000,
    })
    okx.getOrderDetail.mockResolvedValueOnce(pendingPlatformOrder).mockResolvedValueOnce({
      ...pendingPlatformOrder,
      status: C2cBuyOrderStatus.PAID,
      payable: false,
    })
    okx.checkAntiFraud.mockResolvedValue({ riskReviewRequired: false })
    okx.markOrderAsPaid.mockResolvedValue(undefined)

    await confirmer.confirmPaid(executable)

    expect(okx.checkAntiFraud).toHaveBeenCalledWith(
      expect.objectContaining({ cookie: 'cookie' }),
      'platform-order-1',
      'CNY',
    )
    expect(okx.markOrderAsPaid).toHaveBeenCalledWith(expect.anything(), 'platform-order-1', '901')
  })

  it('keeps the merchant order pending and never sends money again when verification is delayed', async () => {
    binance.getOrderDetail.mockReset()
    binance.getOrderDetail
      .mockResolvedValueOnce(pendingPlatformOrder)
      .mockResolvedValueOnce(pendingPlatformOrder)

    await expect(confirmer.confirmPaid(executable)).rejects.toThrow('平台尚未确认已付款')
    expect(store.transitionMerchantOrder).toHaveBeenCalledTimes(1)
  })

  it.each([C2cBuyOrderStatus.CANCELLED, C2cBuyOrderStatus.EXPIRED, C2cBuyOrderStatus.DISPUTED])(
    'moves a paid order to funds exception when platform status is %s',
    async (status) => {
      binance.getOrderDetail.mockReset()
      binance.getOrderDetail.mockResolvedValue({ ...pendingPlatformOrder, status, payable: false })

      await expect(confirmer.confirmPaid(executable)).rejects.toBeInstanceOf(
        PlatformFundsExceptionError,
      )
      expect(binance.markOrderAsPaid).not.toHaveBeenCalled()
      expect(store.transitionMerchantOrder).toHaveBeenLastCalledWith(
        'tenant-1',
        'merchant-order-1',
        MerchantOrderStatus.FUNDS_EXCEPTION,
        status,
      )
    },
  )

  it('does not mark paid when platform payment details changed after the Alipay success', async () => {
    binance.getOrderDetail.mockReset()
    binance.getOrderDetail.mockResolvedValue({
      ...pendingPlatformOrder,
      platformPaymentMethodId: '902',
    })

    await expect(confirmer.confirmPaid(executable)).rejects.toThrow('平台付款方式已变化')
    expect(binance.markOrderAsPaid).not.toHaveBeenCalled()
  })
})
