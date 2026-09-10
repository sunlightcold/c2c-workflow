import { Injectable } from '@nestjs/common'
import { AlipaySdk, type AlipaySdkConfig } from 'alipay-sdk'
import type { AlipayGateway } from './payment-adapter.types'

const ALIPAY_GATEWAYS = new Set([
  'https://openapi.alipay.com/gateway.do',
  'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
])

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
    const gateway = credential.gateway?.trim()
    if (gateway && !ALIPAY_GATEWAYS.has(gateway)) throw new Error('支付宝网关地址不在允许范围内')
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
}
