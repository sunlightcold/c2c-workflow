import { AlipayGatewayFactory } from './alipay-gateway.factory'

describe('AlipayGatewayFactory', () => {
  const factory = new AlipayGatewayFactory()

  it('rejects incomplete RSA2 key-mode credentials', () => {
    expect(() => factory.create({ authMode: 'KEY', appId: 'app', privateKey: 'private' })).toThrow(
      '支付宝验签公钥未配置',
    )
  })

  it('rejects incomplete certificate-mode credentials', () => {
    expect(() =>
      factory.create({
        authMode: 'CERT',
        appId: 'app',
        privateKey: 'private',
        appCertContent: 'app-cert',
      }),
    ).toThrow('支付宝证书配置不完整')
  })

  it('rejects unsupported authentication modes at the SDK boundary', () => {
    expect(() =>
      factory.create({ authMode: 'AUTO' as never, appId: 'app', privateKey: 'private' }),
    ).toThrow('支付宝认证模式必须是 KEY 或 CERT')
  })

  it('rejects non-Alipay gateway URLs before constructing the SDK', () => {
    expect(() =>
      factory.create({
        authMode: 'KEY',
        appId: 'app',
        privateKey: 'private',
        alipayPublicKey: 'public',
        gateway: 'https://example.com/gateway.do',
      }),
    ).toThrow('支付宝网关地址不在允许范围内')
  })
})
