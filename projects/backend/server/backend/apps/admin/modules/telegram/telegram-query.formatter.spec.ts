import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import { formatBatchQuery, formatOrderQuery } from './telegram-query.formatter'

describe('telegram payout query formatter', () => {
  it('renders an actionable and escaped order query like the payout bot', () => {
    const reply = formatOrderQuery(
      {
        id: '00000000-0000-4000-8000-000000000001',
        paymentNo: 'PAY001',
        sourceBusinessNo: '<M001>',
        amount: '100',
        currency: 'CNY',
        payeeName: '张三',
        payeeIdentity: '13800138000',
        status: PaymentOrderStatus.SUCCESS,
        createdAt: '2026-09-14T01:00:00.000Z',
        updatedAt: '2026-09-14T02:00:00.000Z',
      },
      { receipt: true },
    )

    expect(reply.parseMode).toBe('HTML')
    expect(reply.text).toContain('<b>转账订单</b>')
    expect(reply.text).toContain('&lt;M001&gt;')
    expect(reply.replyMarkup?.inline_keyboard[0]).toEqual([
      {
        text: '获取回单',
        callback_data: 'query:receipt:00000000-0000-4000-8000-000000000001',
      },
    ])
  })

  it('paginates batch children eight at a time without showing system payment numbers', () => {
    const orders = Array.from({ length: 9 }, (_, index) => ({
      sourceBusinessNo: `MCH${index + 1}`,
      payeeName: '收款人',
      payeeIdentity: '13800138000',
      amount: '10',
      status: 'SUCCESS',
    }))
    const first = formatBatchQuery({
      batchNo: 'BAT001',
      currency: 'CNY',
      totalAmount: '90',
      totalCount: 9,
      successCount: 9,
      failedCount: 0,
      processingCount: 0,
      unknownCount: 0,
      status: PaymentBatchStatus.SUCCESS,
      orders,
    })

    expect(first.totalPages).toBe(2)
    expect(first.text).toContain('商户订单号：<code>MCH1</code>')
    expect(first.text).not.toContain('MCH9')
    expect(first.replyMarkup?.inline_keyboard[0]).toEqual([
      { text: '下一页', callback_data: 'query:batch:BAT001:1' },
    ])
  })
})
