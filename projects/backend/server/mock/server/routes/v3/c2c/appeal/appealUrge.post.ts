import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'

export default defineEventHandler(async (event) => {
  const response = getOkxC2cPlugin().handle({
    method: 'POST',
    path: '/v3/c2c/appeal/appealUrge',
    query: Object.fromEntries(
      Object.entries(getQuery(event)).map(([key, value]) => [
        key,
        Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''),
      ]),
    ),
    body: await readBody(event),
    headers: event.headers,
  })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
