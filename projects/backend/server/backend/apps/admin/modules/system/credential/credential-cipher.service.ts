import { getConfig } from '@/common/utils/config'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { decryptCredential, encryptCredential } from './credential-cipher'

@Injectable()
export class CredentialCipherService {
  decrypt(value: string): string {
    try {
      return decryptCredential(value, this.getMasterKey())
    } catch (error: unknown) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Stored credential cannot be decrypted',
      )
    }
  }

  encrypt(value: string): string {
    return encryptCredential(value, this.getMasterKey())
  }

  private getMasterKey(): string {
    const key = getConfig('admin').credentialMasterKey?.trim()
    if (!key) {
      throw new InternalServerErrorException('admin.credentialMasterKey is not configured')
    }
    return key
  }
}
