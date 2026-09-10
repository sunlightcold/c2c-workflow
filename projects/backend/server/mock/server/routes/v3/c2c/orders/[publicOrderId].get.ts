import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'

export default defineEventHandler((event) => {
  const publicOrderId = getRouterParam(event, 'publicOrderId') ?? ''
  const response = getOkxC2cPlugin().handle({ method: 'GET', path: `/v3/c2c/orders/${publicOrderId}`, query: {}, body: {}, headers: event.headers })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
