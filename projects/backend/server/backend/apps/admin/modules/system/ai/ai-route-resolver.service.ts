import { SysAiChannelStatus } from '@admin/database/system/ai-channel.entity'
import { SysAiFeatureRouteEntity } from '@admin/database/system/ai-feature-route.entity'
import { CredentialCipherService } from '../credential'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AiCapability } from '@/common/models'
import { AiRouteResolver, AiRouteTarget, ResolvedAiRoute } from './ai.types'

@Injectable()
export class DatabaseAiRouteResolver implements AiRouteResolver {
  constructor(
    @InjectRepository(SysAiFeatureRouteEntity)
    private readonly routeRepository: Repository<SysAiFeatureRouteEntity>,
    private readonly credentialCipher: CredentialCipherService,
  ) {}

  async resolve(
    featureCode: string,
    capability: AiCapability,
    routeTarget?: AiRouteTarget,
  ): Promise<ResolvedAiRoute[]> {
    const routes = await this.routeRepository.find({
      where: {
        featureCode,
        capability,
        enabled: true,
        ...(routeTarget
          ? {
              channel: { code: routeTarget.channelCode },
              model: { code: routeTarget.modelCode },
            }
          : {}),
      },
      relations: { channel: true, model: true },
      order: { priority: 'ASC' },
    })
    return routes.flatMap((route) => {
      const { channel, model } = route
      if (
        !channel ||
        !model ||
        channel.status !== SysAiChannelStatus.ACTIVE ||
        !model.enabled ||
        channel.adapterCode !== model.adapterCode ||
        !model.capabilities.includes(capability)
      ) {
        return []
      }
      return [
        {
          channel: {
            adapterCode: channel.adapterCode,
            apiKey: this.credentialCipher.decrypt(channel.encryptedApiKey),
            baseUrl: channel.baseUrl,
            code: channel.code,
            maxConcurrency: channel.maxConcurrency,
            maxQueuedRequests: channel.maxQueuedRequests,
            timeoutMs: channel.timeoutMs,
          },
          model: {
            adapterCode: model.adapterCode,
            code: model.code,
            name: model.name,
            upstreamModel: model.upstreamModel,
          },
        },
      ]
    })
  }
}
