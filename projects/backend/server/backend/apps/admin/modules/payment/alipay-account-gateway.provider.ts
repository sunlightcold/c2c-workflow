import { Inject, Injectable } from '@nestjs/common'
import { SECRET_RESOLVER, type SecretResolver } from '../system/credential'
import { AlipayGatewayFactory, type AlipayCredential } from './alipay-gateway.factory'
import type { AlipayGateway } from './payment-adapter.types'

export interface AlipayAccountGatewayFactory {
  create: (credentialRef: string) => Promise<AlipayGateway>
}

export const ALIPAY_ACCOUNT_GATEWAY_FACTORY = Symbol('ALIPAY_ACCOUNT_GATEWAY_FACTORY')

@Injectable()
export class AlipayAccountGatewayProvider implements AlipayAccountGatewayFactory {
  constructor(
    @Inject(SECRET_RESOLVER) private readonly secretResolver: SecretResolver,
    private readonly factory: AlipayGatewayFactory,
  ) {}

  async create(credentialRef: string): Promise<AlipayGateway> {
    const secret = await this.secretResolver.resolve(credentialRef)
    return this.factory.create(this.credential(secret))
  }

  private credential(secret: Record<string, unknown>): AlipayCredential {
    const authMode = this.text(secret.authMode)
    if (authMode !== 'KEY' && authMode !== 'CERT') {
      throw new Error('支付宝认证模式必须是 KEY 或 CERT')
    }
    const credential: AlipayCredential = {
      authMode,
      appId: this.text(secret.appId),
      privateKey: this.text(secret.privateKey),
    }
    const optionalFields = [
      'gateway',
      'alipayPublicKey',
      'appCertContent',
      'alipayPublicCertContent',
      'alipayRootCertContent',
    ] as const
    for (const field of optionalFields) {
      const value = this.text(secret[field])
      if (value) credential[field] = value
    }
    return credential
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }
}
