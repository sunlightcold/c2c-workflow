import { getBinanceC2cPlugin } from '@mock/upstreams/binance-c2c/plugin-registry'

export default defineEventHandler(async (event) => {
  const query = Object.fromEntries(
    Object.entries(getQuery(event)).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''),
    ]),
  )
  const response = getBinanceC2cPlugin().handle({
    path: '/sapi/v1/c2c/ads/update',
    body: await readBody(event),
    query,
    headers: event.headers,
  })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
