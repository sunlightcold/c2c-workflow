import { getBinanceC2cPlugin } from '@mock/upstreams/binance-c2c/plugin-registry'

export default defineEventHandler(async (event) => {
  const response = getBinanceC2cPlugin().handle({
    path: '/sapi/v1/c2c/orderMatch/listUserOrderHistory',
    body: {},
    query: Object.fromEntries(
      Object.entries(getQuery(event)).map(([key, value]) => [
        key,
        Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''),
      ]),
    ),
    headers: event.headers,
  })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
