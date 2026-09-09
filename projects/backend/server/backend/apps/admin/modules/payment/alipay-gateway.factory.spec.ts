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
})
