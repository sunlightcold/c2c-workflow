import { getBinanceC2cPlugin } from '@mock/upstreams/binance-c2c/plugin-registry'

export default defineEventHandler((event) => {
  const response = getBinanceC2cPlugin().handle({
    path: '/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination',
    body: {},
    query: Object.fromEntries(
      Object.entries(getQuery(event)).map(([key, value]) => [key, String(value ?? '')]),
    ),
    headers: event.headers,
  })
  setResponseStatus(event, response.status)
  return response.body
})
