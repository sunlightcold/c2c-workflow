jest.mock('@/common/utils/config', () => ({
  getConfig: jest.fn(() => ({
    credentialMasterKey: 'test-credential-master-key-with-sufficient-entropy',
  })),
}))

import { InternalServerErrorException } from '@nestjs/common'
import { CredentialCipherService } from './credential-cipher.service'

describe('CredentialCipherService', () => {
  const service = new CredentialCipherService()

  it('encrypts and decrypts credentials without exposing plaintext', () => {
    const encrypted = service.encrypt('provider-secret-value')
    expect(encrypted).not.toContain('provider-secret-value')
    expect(service.decrypt(encrypted)).toBe('provider-secret-value')
  })

  it('rejects a credential with an invalid authentication tag', () => {
    const parts = service.encrypt('provider-secret-value').split(':')
    parts[2] = Buffer.from('invalid-tag').toString('base64url')
    expect(() => service.decrypt(parts.join(':'))).toThrow(InternalServerErrorException)
  })
})
