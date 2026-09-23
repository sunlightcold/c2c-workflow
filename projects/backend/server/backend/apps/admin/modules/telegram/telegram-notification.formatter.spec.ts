import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import {
  formatBatchStatusMessage,
  formatAutomaticBatchSubmissionMessage,
  formatC2cCreatedMessage,
  formatExceptionMessage,
  formatOrderDiscoveredMessage,
  formatPaymentStatusMessage,
  shouldNotifyBatchStatus,
  shouldNotifyOrderDiscovered,
  shouldNotifyPaymentStatus,
} from './telegram-notification.formatter'

describe('Telegram notification formatting policy', () => {
  it('formats blocked payment-order creation with the platform order and reason', () => {
    expect(
      formatExceptionMessage(
        'C2C_PAYMENT_ORDER_NOT_CREATED',
        '收款方式持有人姓名为空',
        '260921214954540',
      ),
    ).toBe(
      '🔴 <b>无法创建支付订单</b>\n\n' +
        '商家订单号：<code>260921214954540</code>\n' +
        '原因：<code>收款方式持有人姓名为空</code>',
    )
  })

  it('matches the pfa-pay credential rejection fields and Chinese platform label', () => {
    expect(
      formatExceptionMessage('C2C_CREDENTIAL_REJECTED', 'Token expired', 'mock-hq-okx', {
        platform: 'OKX',
        merchantNo: 'okx-merchant-1',
      }),
    ).toBe(
      '<b>⚠️ C2C 凭证失效，账号已停用</b>\n\n' +
        '平台：<code>欧易</code>\n' +
        '账号：<code>mock-hq-okx</code>\n' +
        '商户号：<code>okx-merchant-1</code>\n' +
        '原因：<code>Token expired</code>\n\n' +
        '请在后台更新该账号的凭证后，将账号重新启用。',
    )
  })

  it('matches the pfa-pay C2C auto-created message sections and field order', () => {
    const message = formatC2cCreatedMessage({
      merchantOrderId: 'merchant-order-1',
      paymentOrderId: 'payment-order-1',
      platformOrderId: 'BN-001',
      paymentNo: 'PAY-001',
      fiatAmount: '26.56',
      fiatCurrency: 'CNY',
      asset: 'USDT',
      assetAmount: '3.8',
      payeeName: '白连宝（收款账户）',
      payeeIdentity: '19523560923',
      paymentMethod: '支付宝',
      identityName: '白连宝',
      identityMatched: true,
      status: PaymentOrderStatus.READY,
    })

    expect(message).toContain('🟢 <b>C2C订单已自动创建</b>')
    expect(message.indexOf('<b>订单信息</b>')).toBeLessThan(message.indexOf('<b>收款信息</b>'))
    expect(message.indexOf('<b>收款信息</b>')).toBeLessThan(message.indexOf('<b>实名核验</b>'))
    expect(message).toContain('姓名：<code>白连宝</code>')
    expect(message).toContain('持有人：<code>白连宝（收款账户）</code>')
    expect(message).toContain('结果：<b>一致，已自动下单</b>')
  })

  it('formats a successful payment like the pfa-pay result notification', () => {
    const message = formatPaymentStatusMessage({
      paymentNo: 'PAY-1',
      sourceBusinessNo: 'ORDER-1',
      amount: '88.6',
      currency: 'CNY',
      paymentMethod: 'ALIPAY',
      payeeName: '张三 <test>',
      payeeIdentity: 'buyer@example.com',
      status: PaymentOrderStatus.SUCCESS,
      upstreamId: 'TRADE-1',
    })

    expect(message).toContain('🟢 <b>转账成功</b>')
    expect(message).toContain('<b>订单信息</b>')
    expect(message).toContain('金额：<code>88.60 CNY</code>')
    expect(message).toContain('姓名：<code>张三 &lt;test&gt;</code>')
    expect(message).toContain('状态：<b>🟢 成功</b>')
  })

  it('does not offer manual confirmation for an order rejected by platform KYC', () => {
    const order = {
      platformOrderId: 'BN-KYC-1',
      fiatAmount: '70',
      fiatCurrency: 'CNY',
      asset: 'USDT',
      assetAmount: '10',
      status: 'PENDING_PAYMENT',
      payeeName: 'Zhang San',
      payeeIdentity: 'payee@example.com',
      paymentMethod: 'ALIPAY',
      identityName: 'Zhang San',
      identityMatched: true,
      payable: false,
      lastError: '卖方 KYC 未通过',
    }

    expect(shouldNotifyOrderDiscovered(order)).toBe(false)
  })

  it('matches the pfa-pay identity-review message text and field order', () => {
    expect(
      formatOrderDiscoveredMessage({
        platformOrderId: '260923135225452',
        fiatAmount: '196.01',
        fiatCurrency: 'CNY',
        asset: 'USDT',
        assetAmount: '29.52',
        status: 'PENDING_PAYMENT',
        payeeName: '秦世纪',
        payeeIdentity: '1042926540@qq.com',
        paymentMethod: 'ALIPAY',
        identityName: '秦逢',
        kycStatus: 'PASS',
        identityMatched: false,
        payable: true,
      }),
    ).toBe(
      '🔴 <b>实名不一致，等待确认</b>\n\n' +
        '<b>订单信息</b>\n' +
        '商家订单号：<code>260923135225452</code>\n' +
        '金额：<code>196.01 CNY</code>\n' +
        '资产：<code>USDT</code>\n\n' +
        '<b>收款信息</b>\n' +
        '姓名：<code>秦逢</code>\n' +
        '账号：<code>1042926540@qq.com</code>\n' +
        '方式：<code>支付宝</code>\n\n' +
        '<b>实名核验</b>\n' +
        'KYC：<code>PASS</code>\n' +
        '实名：<code>秦逢</code>\n' +
        '持有人：<code>秦世纪</code>\n' +
        '结果：<b>不一致</b>',
    )
  })

  it('does not offer a confirmation button for incomplete or expired payment details', () => {
    const order = {
      status: 'PENDING_PAYMENT',
      identityMatched: false,
      payable: true,
      kycStatus: 'PASS',
      identityName: '秦逢',
      payeeName: '秦世纪',
      payeeIdentity: '1042926540@qq.com',
      paymentMethod: 'ALIPAY',
      fiatCurrency: 'CNY',
      platformPaymentMethodId: '15549410',
      paymentDeadline: new Date('2099-01-01T00:00:00.000Z'),
    }
    expect(shouldNotifyOrderDiscovered(order)).toBe(true)
    expect(shouldNotifyOrderDiscovered({ ...order, platformPaymentMethodId: null })).toBe(false)
    expect(shouldNotifyOrderDiscovered({ ...order, fiatCurrency: 'USD' })).toBe(false)
    expect(
      shouldNotifyOrderDiscovered({
        ...order,
        paymentDeadline: new Date('2000-01-01T00:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('formats one aggregate partial-success batch result with failure details', () => {
    const message = formatBatchStatusMessage({
      batchNo: 'BAT-1',
      automatic: true,
      currency: 'CNY',
      status: PaymentBatchStatus.PARTIAL_SUCCESS,
      totalCount: 3,
      totalAmount: '300',
      successCount: 2,
      successAmount: '210.5',
      failedCount: 1,
      failedAmount: '89.5',
      failedDetails: '\n商家订单号：<code>ORDER-3</code>',
    })

    expect(message).toContain('🟠 <b>自动批次处理结果</b>')
    expect(message).toContain('状态：<b>🟠 部分成功</b>')
    expect(message).toContain('成功：<code>2</code> 笔 / <code>210.50 CNY</code>')
    expect(message).toContain('失败：<code>1</code> 笔 / <code>89.50 CNY</code>')
    expect(message).toContain('🔴 <b>失败明细</b>')
  })

  it('formats the automatic batch submission notice like pfa-pay', () => {
    const message = formatAutomaticBatchSubmissionMessage({
      totalCount: 6,
      totalAmount: '1944.15',
      groups: 1,
      submitted: 1,
      failed: 0,
    })

    expect(message).toBe(
      '<b>自动批次提交结果</b>\n\n' +
        '本次提交订单：<code>6</code> 笔\n' +
        '订单总金额：<code>¥1944.15</code>\n' +
        '发现批次组：<code>1</code>\n' +
        '已提交批次：<code>1</code>\n' +
        '失败批次：<code>0</code>',
    )
  })

  it('allows created and terminal payment statuses but not intermediate statuses', () => {
    expect(shouldNotifyPaymentStatus(PaymentOrderStatus.READY)).toBe(true)
    expect(shouldNotifyPaymentStatus(PaymentOrderStatus.PENDING_CONFIG)).toBe(true)
    expect(shouldNotifyPaymentStatus(PaymentOrderStatus.PROCESSING)).toBe(false)
    expect(shouldNotifyPaymentStatus(PaymentOrderStatus.SUCCESS)).toBe(true)
    expect(shouldNotifyPaymentStatus(PaymentOrderStatus.PROCESSING)).toBe(false)
    expect(shouldNotifyBatchStatus(PaymentBatchStatus.PROCESSING)).toBe(false)
    expect(shouldNotifyBatchStatus(PaymentBatchStatus.PARTIAL_SUCCESS)).toBe(true)
  })
})
