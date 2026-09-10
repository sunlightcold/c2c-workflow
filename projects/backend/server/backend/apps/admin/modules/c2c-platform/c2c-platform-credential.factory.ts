import { MerchantPlatform } from '@admin/database'
import { Injectable } from '@nestjs/common'
import type { BinanceCredentials } from './binance-c2c.client'
import type { OkxWebPrivateCredentials } from './okx-web-private.client'

export interface C2cCredentialReference {
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
        secretKey,
        clientType: reference.clientType,
        timeoutMs: reference.requestTimeoutMs,
        ...(reference.xUserId ? { xUserId: reference.xUserId } : {}),
      }
    }
    const cookie = this.text(secret.cookie)
    const authorization = this.text(secret.authorization)
    if (!cookie || !authorization) throw new Error('欧易 Secret 缺少 cookie 或 authorization')
    return { cookie, authorization, timeoutMs: reference.requestTimeoutMs }
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }
}
