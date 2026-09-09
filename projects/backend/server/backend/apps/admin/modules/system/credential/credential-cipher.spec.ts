import { decryptCredential, encryptCredential } from './credential-cipher'

describe('credential cipher', () => {
  const masterKey = 'test-credential-master-key-with-sufficient-entropy'

  it('encrypts credentials for reuse by services and migrations', () => {
    const encrypted = encryptCredential('provider-secret-value', masterKey)

    expect(encrypted).not.toContain('provider-secret-value')
    expect(decryptCredential(encrypted, masterKey)).toBe('provider-secret-value')
  })
})
