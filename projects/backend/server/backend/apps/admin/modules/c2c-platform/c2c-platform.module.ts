import { Module } from '@nestjs/common'
import { AxiosC2cHttpTransport } from './axios-c2c-http.transport'
import { BinanceC2cClient } from './binance-c2c.client'
import { C2C_HTTP_TRANSPORT } from './c2c-platform.types'
import { OkxWebPrivateClient } from './okx-web-private.client'
import { C2cPlatformCredentialFactory } from './c2c-platform-credential.factory'

@Module({
  providers: [
    AxiosC2cHttpTransport,
    { provide: C2C_HTTP_TRANSPORT, useExisting: AxiosC2cHttpTransport },
    BinanceC2cClient,
    OkxWebPrivateClient,
    C2cPlatformCredentialFactory,
  ],
  exports: [BinanceC2cClient, C2cPlatformCredentialFactory, OkxWebPrivateClient],
})
export class C2cPlatformModule {}
