import { Injectable } from '@nestjs/common'
import { AlipaySdk, type AlipaySdkConfig } from 'alipay-sdk'
import type { AlipayGateway } from './payment-adapter.types'

const DEFAULT_ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do'

export interface AlipayCredential {
  authMode: 'KEY' | 'CERT'
  appId: string
  privateKey: string
  gateway?: string
  alipayPublicKey?: string
  appCertContent?: string
  alipayPublicCertContent?: string
  alipayRootCertContent?: string
}

@Injectable()
export class AlipayGatewayFactory {
  create(credential: AlipayCredential): AlipayGateway {
    if (credential.authMode !== 'KEY' && credential.authMode !== 'CERT')
      throw new Error('支付宝认证模式必须是 KEY 或 CERT')
    const appId = this.requireValue(credential.appId, '支付宝应用 ID 未配置')
    const privateKey = this.requireValue(credential.privateKey, '支付宝应用私钥未配置')
    const gateway = this.httpGateway(credential.gateway)
    const config: AlipaySdkConfig = {
      appId,
      privateKey,
      gateway,
      keyType: 'PKCS8',
      signType: 'RSA2',
    }
    if (credential.authMode === 'KEY') {
      config.alipayPublicKey = this.requireValue(credential.alipayPublicKey, '支付宝验签公钥未配置')
    } else {
      const certificates = [
        credential.appCertContent,
        credential.alipayPublicCertContent,
        credential.alipayRootCertContent,
      ]
      if (!certificates.every((value) => typeof value === 'string' && value.trim()))
        throw new Error('支付宝证书配置不完整')
      Object.assign(config, {
        appCertContent: credential.appCertContent,
        alipayPublicCertContent: credential.alipayPublicCertContent,
        alipayRootCertContent: credential.alipayRootCertContent,
      })
    }
    const sdk = new AlipaySdk(config)
    return {
      execute: <T>(method: string, bizContent: Record<string, unknown>) =>
        sdk.exec(method, { bizContent }) as Promise<T>,
    }
  }

  private requireValue(value: string | undefined, message: string): string {
    if (!value?.trim()) throw new Error(message)
    return value.trim()
  }

  private httpGateway(value: string | undefined): string {
    const gateway = value?.trim() || DEFAULT_ALIPAY_GATEWAY
    let url: URL
    try {
      url = new URL(gateway)
    } catch {
      throw new Error('支付宝 API 网关地址格式不正确')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('支付宝 API 网关仅支持 HTTP 或 HTTPS')
    }
    return gateway
  }
}
