import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'

export default defineEventHandler(async (event) => {
  const query = Object.fromEntries(
    Object.entries(getQuery(event)).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''),
    ]),
  )
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file')
  const response = getOkxC2cPlugin().handle({
    method: 'POST',
    path: '/v3/c2c/files/',
    query,
    body: {
      file: file
        ? {
            filename: file.filename,
            type: file.type,
            size: file.data?.byteLength ?? 0,
          }
        : undefined,
    },
    headers: event.headers,
  })
  setResponseStatus(event, response.status ?? 200)
  return response.body
})
