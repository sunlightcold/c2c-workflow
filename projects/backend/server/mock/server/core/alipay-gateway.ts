import { getPluginRegistry } from './runtime'

function stringRecord(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''),
    ]),
  )
}

/** Handles both the generic Alipay gateway and fixed-method compatibility routes. */
export async function handleAlipayGateway(event: any, methodOverride?: string) {
  const query = stringRecord(getQuery(event))
  const rawBody = await readBody<Record<string, unknown> | string | undefined>(event)
  const body =
    typeof rawBody === 'string'
      ? stringRecord(Object.fromEntries(new URLSearchParams(rawBody)))
      : stringRecord(rawBody ?? {})
  const params = { ...query, ...body }
  const response = await getPluginRegistry().dispatch({
    method: methodOverride ?? params.method ?? '',
    params,
    headers: event.headers,
    origin: getRequestURL(event).origin,
  })
  setResponseStatus(event, response.status ?? 200)
  for (const [key, value] of Object.entries(response.headers ?? {})) setResponseHeader(event, key, value)
  return response.body
}
