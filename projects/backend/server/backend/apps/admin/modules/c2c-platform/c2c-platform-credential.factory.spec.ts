import { MerchantPlatform } from '@admin/database'
import { C2cPlatformCredentialFactory } from './c2c-platform-credential.factory'

describe('C2cPlatformCredentialFactory', () => {
  const factory = new C2cPlatformCredentialFactory()

  it('builds platform-specific credentials without retaining the Secret object', () => {
    expect(
      factory.create(
        MerchantPlatform.BINANCE,
        { clientType: 'WEB', xUserId: 'user-1', requestTimeoutMs: 5000 },
        { apiKey: ' key ', secretKey: ' secret ', ignored: 'value' },
      ),
    ).toEqual({
      apiKey: 'key',
      baseUrl: 'https://api.binance.com',
      secretKey: 'secret',
      clientType: 'WEB',
      xUserId: 'user-1',
      timeoutMs: 5000,
    })
    expect(
      factory.create(
        MerchantPlatform.OKX,
        { clientType: null, xUserId: null, requestTimeoutMs: 6000 },
        { cookie: ' cookie ', authorization: ' token ', ignored: 'value' },
      ),
    ).toEqual({
      cookie: 'cookie',
      authorization: 'token',
      baseUrl: 'https://www.okx.com',
      timeoutMs: 6000,
    })
  })
})
