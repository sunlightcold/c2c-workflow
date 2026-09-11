import { AlipaySdk } from 'alipay-sdk'
import { AlipayGatewayFactory } from './alipay-gateway.factory'

jest.mock('alipay-sdk', () => ({
  AlipaySdk: jest.fn().mockImplementation(() => ({ exec: jest.fn() })),
}))

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

  it('accepts a custom HTTP API gateway', () => {
    const gateway = 'http://payment-mock.internal/alipay/gateway.do'

    factory.create({
      authMode: 'KEY',
      appId: 'app',
      privateKey: 'private',
      alipayPublicKey: 'public',
      gateway,
    })

    expect(AlipaySdk).toHaveBeenCalledWith(expect.objectContaining({ gateway }))
  })

  it('rejects a non-HTTP API gateway', () => {
    expect(() =>
      factory.create({
        authMode: 'KEY',
        appId: 'app',
        privateKey: 'private',
        alipayPublicKey: 'public',
        gateway: 'file:///etc/passwd',
      }),
    ).toThrow('支付宝 API 网关仅支持 HTTP 或 HTTPS')
  })
})
