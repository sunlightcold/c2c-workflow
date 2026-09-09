import { Global, Module } from '@nestjs/common'
import { CredentialCipherService } from './credential-cipher.service'

@Global()
@Module({
  providers: [CredentialCipherService],
  exports: [CredentialCipherService],
})
export class CredentialModule {}
