import { createHmac } from 'node:crypto'
import { getBinanceC2cState } from './state'

export function chatCredential(merchantId: string, secretKey: string) {
  const listenKey = Buffer.from(merchantId).toString('base64url')
  return {
    chatWssUrl: 'ws://127.0.0.1:13002/chat',
    listenKey,
    listenToken: createHmac('sha256', secretKey).update(listenKey).digest('hex'),
  }
}

export function chatMerchant(requestUrl: string) {
  const url = new URL(requestUrl, 'http://127.0.0.1:13002')
  const listenKey = url.pathname.split('/').at(-1) ?? ''
  const merchantId = Buffer.from(listenKey, 'base64url').toString()
  const credential = chatCredential(merchantId, getBinanceC2cState().getSettings().secretKey)
  if (
    !merchantId ||
    credential.listenKey !== listenKey ||
    url.searchParams.get('token') !== credential.listenToken
  )
    throw new Error('Mock聊天凭据无效')
  return merchantId
}

export function fixedChatMessages(orderNo: string) {
  return ['你好，请问这笔订单什么时候付款？', '收款信息已确认，有问题请联系我。'].map(
    (content, index) => ({
      id: `mock:${orderNo}:${index}`,
      orderNo,
      type: 'text',
      content,
      self: false,
      fromNickname: 'Mock测试用户',
      createTime: Date.now(),
    }),
  )
}

export function mockChatReply(merchantId: string, frame: Record<string, unknown>) {
  const order = getBinanceC2cState().orders.find(String(frame.orderNo))
  if (
    !order ||
    order.externalMerchantId !== merchantId ||
    order.tradeType !== 'BUY' ||
    ![1, 2, 3].includes(order.orderStatus)
  )
    throw new Error('Mock订单当前不可聊天')
  if (
    frame.type !== 'text' ||
    typeof frame.content !== 'string' ||
    !frame.content.trim() ||
    typeof frame.uuid !== 'string'
  )
    throw new Error('Mock聊天仅支持文字')
  return [
    { ...frame, self: true },
    {
      id: `mock:reply:${frame.uuid}`,
      orderNo: order.orderNumber,
      type: 'text',
      content: '收到，请稍等，我正在核实订单。',
      self: false,
      fromNickname: 'Mock测试用户',
      createTime: Date.now(),
    },
  ]
}
