import { MerchantPlatform } from '@admin/database'
import { Injectable } from '@nestjs/common'
import type { BinanceCredentials } from './binance-c2c.client'
import type { OkxWebPrivateCredentials } from './okx-web-private.client'

export interface C2cCredentialReference {
  apiBaseUrl?: string
  clientType: string | null
  xUserId: string | null
  requestTimeoutMs: number
}

@Injectable()
export class C2cPlatformCredentialFactory {
  create(
    platform: MerchantPlatform,
    reference: C2cCredentialReference,
    secret: Record<string, unknown>,
  ): BinanceCredentials | OkxWebPrivateCredentials {
    if (platform === MerchantPlatform.BINANCE) {
      const apiKey = this.text(secret.apiKey)
      const secretKey = this.text(secret.secretKey)
      if (!apiKey || !secretKey || !reference.clientType)
        throw new Error('币安 Secret 缺少 apiKey、secretKey 或 clientType')
      return {
        apiKey,
        baseUrl: reference.apiBaseUrl ?? 'https://api.binance.com',
        secretKey,
        clientType: reference.clientType,
        timeoutMs: reference.requestTimeoutMs,
        ...(reference.xUserId ? { xUserId: reference.xUserId } : {}),
      }
    }
    const cookie = this.text(secret.cookie)
    const authorization = this.text(secret.authorization)
    const signaturePrivateKey = this.text(secret.signaturePrivateKey)
    if (!cookie || !authorization || !signaturePrivateKey)
      throw new Error('欧易 Secret 缺少 cookie、authorization 或 signaturePrivateKey')
    return {
      cookie,
      authorization,
      signaturePrivateKey,
      ...(typeof secret.skipPaymentProofUpload === 'boolean'
        ? { skipPaymentProofUpload: secret.skipPaymentProofUpload }
        : {}),
      baseUrl: reference.apiBaseUrl ?? 'https://www.okx.com',
      timeoutMs: reference.requestTimeoutMs,
    }
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }
}
