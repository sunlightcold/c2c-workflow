import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import {
  formatBatchStatusMessage,
  formatAutomaticBatchSubmissionMessage,
  formatC2cCreatedMessage,
  formatPaymentStatusMessage,
  shouldNotifyBatchStatus,
  shouldNotifyPaymentStatus,
} from './telegram-notification.formatter'

describe('Telegram notification formatting policy', () => {
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
      payeeName: '白连宝',
      payeeIdentity: '19523560923',
      paymentMethod: '支付宝',
      identityName: '白连宝',
      identityMatched: true,
      status: PaymentOrderStatus.READY,
    })

    expect(message).toContain('🟢 <b>C2C订单已自动创建</b>')
    expect(message.indexOf('<b>订单信息</b>')).toBeLessThan(message.indexOf('<b>收款信息</b>'))
    expect(message.indexOf('<b>收款信息</b>')).toBeLessThan(message.indexOf('<b>实名核验</b>'))
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
      status: PaymentOrderStatus.COMPLETED,
      upstreamId: 'TRADE-1',
    })

    expect(message).toContain('🟢 <b>转账成功</b>')
    expect(message).toContain('<b>订单信息</b>')
    expect(message).toContain('金额：<code>88.60 CNY</code>')
    expect(message).toContain('姓名：<code>张三 &lt;test&gt;</code>')
    expect(message).toContain('状态：<b>🟢 成功</b>')
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
    expect(shouldNotifyPaymentStatus(PaymentOrderStatus.COMPLETED)).toBe(true)
    expect(shouldNotifyBatchStatus(PaymentBatchStatus.PROCESSING)).toBe(false)
    expect(shouldNotifyBatchStatus(PaymentBatchStatus.PARTIAL_SUCCESS)).toBe(true)
  })
})
