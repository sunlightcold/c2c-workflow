import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'

export default defineEventHandler(async (event) => {
  const query = Object.fromEntries(
    Object.entries(getQuery(event)).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''),
    ]),
  )
  await readMultipartFormData(event)
  const response = getOkxC2cPlugin().handle({
    method: 'POST',
    path: '/v3/c2c/files/',
    query,
    body: {},
    headers: event.headers,
  })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
