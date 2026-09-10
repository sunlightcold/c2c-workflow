import type { CredentialCipherService } from '../system/credential/credential-cipher.service'
import { EnvironmentC2cSecretResolver } from './c2c-secret-resolver'

describe('EnvironmentC2cSecretResolver', () => {
  const cipher = { decrypt: jest.fn() }
  const resolver = new EnvironmentC2cSecretResolver(cipher as unknown as CredentialCipherService)

  beforeEach(() => jest.clearAllMocks())

  it('resolves an encrypted database credential without exposing it through configuration', async () => {
    cipher.decrypt.mockReturnValue('{"apiKey":"key","secretKey":"secret"}')

    await expect(resolver.resolve('enc://ciphertext')).resolves.toEqual({
      apiKey: 'key',
      secretKey: 'secret',
    })
    expect(cipher.decrypt).toHaveBeenCalledWith('ciphertext')
  })

  it('rejects decrypted values that are not credential objects', async () => {
    cipher.decrypt.mockReturnValue('[]')

    await expect(resolver.resolve('enc://ciphertext')).rejects.toThrow(
      'Secret 引用内容必须是 JSON 对象',
    )
  })
})
