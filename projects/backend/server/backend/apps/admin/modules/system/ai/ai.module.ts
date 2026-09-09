import {
  SysAiCallLogEntity,
  SysAiChannelEntity,
  SysAiFeatureRouteEntity,
  SysAiModelEntity,
} from '@admin/database'
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OpenAiChatCompletionsAdapter } from './adapters/openai-chat-completions.adapter'
import { OpenAiImagesAdapter } from './adapters/openai-images.adapter'
import { OpenAiResponsesAdapter } from './adapters/openai-responses.adapter'
import { GeminiGenerateContentAdapter } from './adapters/gemini-generate-content.adapter'
import { DefaultAiAdapterRegistry } from './ai-adapter.registry'
import { AiChannelService } from './ai-channel.service'
import { AiController } from './ai.controller'
import { AiFeatureRouteService } from './ai-feature-route.service'
import {
  AI_ADAPTER_REGISTRY,
  AI_CALL_LOG_SERVICE,
  AI_ROUTE_RESOLVER,
  AiGatewayService,
} from './ai-gateway.service'
import { AiModelService } from './ai-model.service'
import { DatabaseAiRouteResolver } from './ai-route-resolver.service'
import { AI_HTTP_TRANSPORT, AxiosAiHttpTransport } from './ai-transport'
import { CredentialModule } from '../credential'
import { AiCallLogService } from './ai-call-log.service'

@Global()
@Module({
  imports: [
    CredentialModule,
    TypeOrmModule.forFeature([
      SysAiCallLogEntity,
      SysAiChannelEntity,
      SysAiFeatureRouteEntity,
      SysAiModelEntity,
    ]),
  ],
  controllers: [AiController],
  providers: [
    AxiosAiHttpTransport,
    { provide: AI_HTTP_TRANSPORT, useExisting: AxiosAiHttpTransport },
    OpenAiChatCompletionsAdapter,
    OpenAiResponsesAdapter,
    OpenAiImagesAdapter,
    GeminiGenerateContentAdapter,
    DefaultAiAdapterRegistry,
    { provide: AI_ADAPTER_REGISTRY, useExisting: DefaultAiAdapterRegistry },
    DatabaseAiRouteResolver,
    { provide: AI_ROUTE_RESOLVER, useExisting: DatabaseAiRouteResolver },
    AiGatewayService,
    AiChannelService,
    AiModelService,
    AiFeatureRouteService,
    AiCallLogService,
    { provide: AI_CALL_LOG_SERVICE, useExisting: AiCallLogService },
  ],
  exports: [AiGatewayService],
})
export class AiModule {}
