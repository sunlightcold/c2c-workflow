/** Keep request structure for audit without persisting credentials. */
export function serializeLogPayload(value: unknown): string {
  return JSON.stringify(value, (key, item) =>
    /password|secret|token|cookie|authorization|apiKey|privateKey|credentialRef/i.test(key)
      ? '[REDACTED]'
      : item,
  )
}
