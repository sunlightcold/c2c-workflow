import { PaymentExecutionMode, PaymentOrderStatus, PaymentSourceType } from '@admin/database'
import { C2cAlipayPaymentExecutor } from './c2c-alipay-payment.executor'
import { PaymentExecutionStatus, type AlipayGateway } from './payment-adapter.types'
import { PaymentNotSubmittedError } from './payment-execution-coordinator'

describe('C2cAlipayPaymentExecutor', () => {
  const executable = {
    id: 'payment-1',
    tenantId: 'tenant-1',
    status: PaymentOrderStatus.SUBMITTING,
  }
  const paymentOrder = {
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
  const preflight = {
    verify: jest.fn(),
    loadContext: jest.fn(),
  }
  const gateway: AlipayGateway = { execute: jest.fn() }
  const gatewayProvider = { create: jest.fn() }
  let executor: C2cAlipayPaymentExecutor

  beforeEach(() => {
    jest.clearAllMocks()
    preflight.verify.mockResolvedValue({
      order: paymentOrder,
      platformOrder: { platformOrderId: 'platform-order-1' },
      paymentAccountCredentialRef: 'env://ALIPAY_ACCOUNT_1',
    })
    preflight.loadContext.mockResolvedValue({
      order: { ...paymentOrder, status: PaymentOrderStatus.UNKNOWN },
      account: { credentialRef: 'env://ALIPAY_ACCOUNT_1' },
    })
    gatewayProvider.create.mockResolvedValue(gateway)
    executor = new C2cAlipayPaymentExecutor(preflight as never, gatewayProvider)
  })

  it('submits an unchanged C2C order through Alipay merchant transfer using the payment number', async () => {
    jest.mocked(gateway.execute).mockResolvedValue({
      code: '10000',
      outBizNo: 'PAY001',
      orderId: 'ALIPAY001',
      status: 'SUCCESS',
    })

    await expect(executor.submit(executable)).resolves.toMatchObject({
      status: PaymentExecutionStatus.SUCCESS,
      upstreamId: 'ALIPAY001',
    })
    expect(preflight.verify).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(gatewayProvider.create).toHaveBeenCalledWith('env://ALIPAY_ACCOUNT_1')
    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.trans.uni.transfer',
      expect.objectContaining({
        out_biz_no: 'PAY001',
        trans_amount: '100.00',
        product_code: 'TRANS_ACCOUNT_NO_PWD',
      }),
    )
  })

  it('classifies gateway preparation failures as definitely not submitted', async () => {
    gatewayProvider.create.mockRejectedValue(new Error('支付宝应用私钥未配置'))

    await expect(executor.submit(executable)).rejects.toEqual(
      new PaymentNotSubmittedError('支付宝应用私钥未配置'),
    )
    expect(gateway.execute).not.toHaveBeenCalled()
  })

  it('does not hide a timeout after the Alipay request may have been submitted', async () => {
    jest.mocked(gateway.execute).mockRejectedValue(new Error('timeout'))

    await expect(executor.submit(executable)).rejects.toThrow('timeout')
  })

  it('queries the original Alipay payment number without repeating preflight payment checks', async () => {
    jest.mocked(gateway.execute).mockResolvedValue({
      code: '10000',
      outBizNo: 'PAY001',
      orderId: 'ALIPAY001',
      status: 'SUCCESS',
    })

    await expect(
      executor.query({ ...executable, status: PaymentOrderStatus.UNKNOWN }),
    ).resolves.toMatchObject({ status: PaymentExecutionStatus.SUCCESS })
    expect(preflight.verify).not.toHaveBeenCalled()
    expect(preflight.loadContext).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.trans.common.query',
      expect.objectContaining({ out_biz_no: 'PAY001' }),
    )
  })
})
