import { Module } from '@nestjs/common'
import { BusinessModule } from '../business'
import { C2cPlatformModule } from '../c2c-platform'
import { ProxyNetworkModule } from '../proxy/proxy-network.module'
import { CredentialModule } from '../system/credential'
import { AuthModule } from '../system/auth'
import { ChatAccessService } from './chat-access.service'
import { BinanceChatAdapter } from './binance-chat.adapter'
import { ChatMemoryStore } from './chat-memory.store'
import { ChatImageService, ChatImageLimitInterceptor } from './chat-image.service'
import { MerchantChatController } from './merchant-chat.controller'
import { MerchantChatGateway } from './merchant-chat.gateway'
import { MerchantChatService } from './merchant-chat.service'

@Module({
  imports: [BusinessModule, C2cPlatformModule, ProxyNetworkModule, CredentialModule, AuthModule],
  controllers: [MerchantChatController],
  providers: [
    ChatAccessService,
    BinanceChatAdapter,
    ChatMemoryStore,
    ChatImageService,
    ChatImageLimitInterceptor,
    MerchantChatService,
    MerchantChatGateway,
  ],
})
export class MerchantChatModule {}
