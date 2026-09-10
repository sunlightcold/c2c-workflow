import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'

export default defineEventHandler((event) => {
  const query = Object.fromEntries(Object.entries(getQuery(event)).map(([key, value]) => [key, Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')]))
  const response = getOkxC2cPlugin().handle({ method: 'GET', path: '/v4/c2c/risk/antiFraudPopup/info', query, body: {}, headers: event.headers })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
