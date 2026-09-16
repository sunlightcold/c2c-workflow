import {
  PaymentAdapterCode,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { AlipayBatchAdapter } from './alipay-batch.adapter'
import { AlipayMerchantTransferAdapter } from './alipay-merchant-transfer.adapter'
import { AlipayReceiptAdapter } from './alipay-receipt.adapter'
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
  const queryContexts = { loadQueryContext: jest.fn() }
  const gateway: AlipayGateway = { execute: jest.fn() }
  const channelFactory = {
    create: jest.fn(),
    getReconciliationPolicies: jest.fn(),
  }
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
    queryContexts.loadQueryContext.mockResolvedValue({
      order: { ...paymentOrder, status: PaymentOrderStatus.UNKNOWN },
      paymentAccountCredentialRef: 'env://ALIPAY_ACCOUNT_1',
      adapterCode: PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER,
      executionMode: PaymentExecutionMode.INSTANT,
      batchNo: null,
    })
    channelFactory.create.mockResolvedValue({
      batch: new AlipayBatchAdapter(gateway),
      order: new AlipayMerchantTransferAdapter(gateway),
      receipt: new AlipayReceiptAdapter(gateway),
    })
    executor = new C2cAlipayPaymentExecutor(
      preflight as never,
      queryContexts as never,
      channelFactory,
    )
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
    expect(channelFactory.create).toHaveBeenCalledWith(
      PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER,
      'env://ALIPAY_ACCOUNT_1',
    )
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
    channelFactory.create.mockRejectedValue(new Error('支付宝应用私钥未配置'))

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
    expect(queryContexts.loadQueryContext).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.trans.common.query',
      expect.objectContaining({ out_biz_no: 'PAY001' }),
    )
  })

  it('queries a manual batch child through the Alipay batch detail API without a merchant order', async () => {
    preflight.loadContext.mockRejectedValue(new Error('支付订单关联的商家订单不存在'))
    queryContexts.loadQueryContext.mockResolvedValue({
      order: {
        ...paymentOrder,
        sourceType: PaymentSourceType.BOT_MANUAL,
        sourceBusinessNo: 'TEST-20260915-015',
        paymentNo: 'PAY20260916192432192797',
        executionMode: PaymentExecutionMode.BATCH,
        status: PaymentOrderStatus.COMPLETED,
      },
      paymentAccountCredentialRef: 'env://ALIPAY_ACCOUNT_1',
      adapterCode: PaymentAdapterCode.ALIPAY_BATCH,
      executionMode: PaymentExecutionMode.BATCH,
      batchNo: 'BAT20260916192535431222',
    })
    jest.mocked(gateway.execute).mockResolvedValue({
      code: '10000',
      outBatchNo: 'BAT20260916192535431222',
      batchTransId: '20260916110070001506180065598597',
      batchStatus: 'SUCCESS',
      totalPageCount: 1,
      accDetailList: [
        {
          outBizNo: 'PAY20260916192432192797',
          detailId: 'DETAIL-1',
          alipayOrderNo: '20260916110070001506180065598597',
          status: 'SUCCESS',
          transAmount: '1.00',
        },
      ],
    })

    await expect(
      executor.query({
        ...executable,
        status: PaymentOrderStatus.COMPLETED,
      }),
    ).resolves.toMatchObject({
      status: PaymentExecutionStatus.SUCCESS,
      upstreamId: '20260916110070001506180065598597',
    })
    expect(preflight.loadContext).not.toHaveBeenCalled()
    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.batch.detail.query',
      expect.objectContaining({
        out_batch_no: 'BAT20260916192535431222',
        product_code: 'BATCH_PAY_V2',
        biz_scene: 'MESSAGE_BATCH_PAY',
      }),
    )
  })
})
