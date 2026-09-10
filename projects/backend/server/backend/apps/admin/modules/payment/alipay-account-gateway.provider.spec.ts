import { AlipayAccountGatewayProvider } from './alipay-account-gateway.provider'

describe('AlipayAccountGatewayProvider', () => {
  const secretResolver = { resolve: jest.fn() }
  const factory = { create: jest.fn() }
  const provider = new AlipayAccountGatewayProvider(secretResolver, factory as never)

  beforeEach(() => jest.clearAllMocks())

  it('creates a key-mode gateway from an internal Secret reference', async () => {
    secretResolver.resolve.mockResolvedValue({
      authMode: 'KEY',
      appId: 'app-id',
      privateKey: 'private-key',
      alipayPublicKey: 'alipay-public-key',
    })
    factory.create.mockReturnValue({ execute: jest.fn() })

    await provider.create('env://ALIPAY_ACCOUNT_1')

    expect(factory.create).toHaveBeenCalledWith({
      authMode: 'KEY',
      appId: 'app-id',
      privateKey: 'private-key',
      alipayPublicKey: 'alipay-public-key',
    })
  })

  it('rejects an unsupported authentication mode before constructing the SDK', async () => {
    secretResolver.resolve.mockResolvedValue({
      authMode: 'AUTO',
      appId: 'app-id',
      privateKey: 'private-key',
    })

    await expect(provider.create('env://ALIPAY_ACCOUNT_1')).rejects.toThrow(
      '支付宝认证模式必须是 KEY 或 CERT',
    )
    expect(factory.create).not.toHaveBeenCalled()
  })
})
