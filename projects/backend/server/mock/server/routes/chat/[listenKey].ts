import { chatMerchant, fixedChatMessages, mockChatReply } from '@mock/upstreams/binance-c2c/chat'
import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'

export default defineWebSocketHandler({
  open(peer) {
    try {
      const merchantId = chatMerchant(peer.request.url)
      for (const order of getBinanceC2cState().orders.list()) {
        if (
          order.externalMerchantId === merchantId &&
          order.tradeType === 'BUY' &&
          [1, 2, 3].includes(order.orderStatus)
        )
          for (const message of fixedChatMessages(order.orderNumber))
            peer.send(JSON.stringify(message))
      }
    } catch {
      peer.close(1008, 'Mock聊天凭据无效')
    }
  },
  message(peer, message) {
    try {
      for (const frame of mockChatReply(
        chatMerchant(peer.request.url),
        message.json<Record<string, unknown>>(),
      ))
        peer.send(JSON.stringify(frame))
    } catch {
      peer.close(1008, 'Mock聊天请求无效')
    }
  },
})
