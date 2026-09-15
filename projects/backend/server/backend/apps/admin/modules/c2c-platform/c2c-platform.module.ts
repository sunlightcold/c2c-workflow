import { Module } from '@nestjs/common'
import { AxiosC2cHttpTransport } from './axios-c2c-http.transport'
import { BinanceC2cClient } from './binance-c2c.client'
import { C2C_HTTP_TRANSPORT } from './c2c-platform.types'
import { OkxWebPrivateClient } from './okx-web-private.client'
import { C2cPlatformCredentialFactory } from './c2c-platform-credential.factory'
import { C2cPlatformClient } from './c2c-platform.client'

@Module({
  providers: [
    AxiosC2cHttpTransport,
    { provide: C2C_HTTP_TRANSPORT, useExisting: AxiosC2cHttpTransport },
    BinanceC2cClient,
    OkxWebPrivateClient,
    C2cPlatformCredentialFactory,
    C2cPlatformClient,
  ],
  exports: [C2cPlatformClient, C2cPlatformCredentialFactory],
})
export class C2cPlatformModule {}
