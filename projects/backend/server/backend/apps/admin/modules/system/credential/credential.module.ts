import { Global, Module } from '@nestjs/common'
import { CredentialCipherService } from './credential-cipher.service'
import { EnvironmentSecretResolver, SECRET_RESOLVER } from './secret-resolver'

@Global()
@Module({
  providers: [
    CredentialCipherService,
    EnvironmentSecretResolver,
    { provide: SECRET_RESOLVER, useExisting: EnvironmentSecretResolver },
  ],
  exports: [CredentialCipherService, EnvironmentSecretResolver, SECRET_RESOLVER],
})
export class CredentialModule {}
