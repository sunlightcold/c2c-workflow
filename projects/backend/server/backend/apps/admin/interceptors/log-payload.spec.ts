import { serializeLogPayload } from './log-payload'

describe('credential audit redaction', () => {
  it('redacts nested credential fields without mutating the request or losing audit scope', () => {
    const body = {
      tenantId: 'tenant',
      merchantId: 'merchant',
      credentials: [
        {
          apiKey: 'private-key',
          secretKey: 'private-secret',
          sessionCookie: 'private-cookie',
          authorization: 'private-auth',
          signaturePrivateKey: 'private-signature',
        },
      ],
      rule: { linkedDiscount: '0.01' },
    }
    const serialized = serializeLogPayload(body)
    expect(serialized).not.toContain('private-')
    expect(JSON.parse(serialized)).toMatchObject({
      tenantId: 'tenant',
      merchantId: 'merchant',
      rule: body.rule,
    })
    expect(body.credentials[0].sessionCookie).toBe('private-cookie')
  })
})
