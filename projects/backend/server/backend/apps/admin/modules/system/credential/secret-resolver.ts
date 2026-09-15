import { Injectable } from '@nestjs/common'
import { CredentialCipherService } from './credential-cipher.service'

export const SECRET_RESOLVER = Symbol('SECRET_RESOLVER')

export interface SecretResolver {
  resolve: (reference: string) => Promise<Record<string, unknown>>
}

@Injectable()
export class EnvironmentSecretResolver implements SecretResolver {
  constructor(private readonly cipher: CredentialCipherService) {}

  async resolve(reference: string): Promise<Record<string, unknown>> {
    if (reference.startsWith('enc://')) {
      return this.parse(this.cipher.decrypt(reference.slice('enc://'.length)))
    }
    const match = /^env:\/\/([A-Z][A-Z0-9_]{2,127})$/.exec(reference)
    if (!match) throw new Error('当前部署只支持 enc:// 或 env:// Secret 引用')
    const value = process.env[match[1]]
    if (!value) throw new Error('Secret 引用未配置')
    return this.parse(value)
  }

  private parse(value: string): Record<string, unknown> {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('Secret 引用内容不是有效 JSON')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Secret 引用内容必须是 JSON 对象')
    }
    return parsed as Record<string, unknown>
  }
}
