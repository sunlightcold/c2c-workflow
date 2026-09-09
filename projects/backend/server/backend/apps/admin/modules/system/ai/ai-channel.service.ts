import { AiAdapterCode, AiCapability } from '@/common/models'
import { SysAiChannelEntity, SysAiChannelStatus } from '@admin/database/system/ai-channel.entity'
import { SysAiFeatureRouteEntity } from '@admin/database/system/ai-feature-route.entity'
import { SysAiModelEntity } from '@admin/database/system/ai-model.entity'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CredentialCipherService } from '../credential'
import { AI_ADAPTER_REGISTRY } from './ai-gateway.service'
import { adapterSupportsCapability } from './ai-policy'
import { AiAdapterRegistry, AiGatewayRequest, ResolvedAiRoute } from './ai.types'

export interface AiChannelView {
  adapterCode: AiAdapterCode
  baseUrl: string
  code: string
  credentialVersion: number
  hasApiKey: boolean
  id: string
  lastCheckedAt: Date | null
  lastCheckMessage: string | null
  maxConcurrency: number
  maxQueuedRequests: number
  name: string
  status: SysAiChannelStatus
  supplier: string
  timeoutMs: number
  updatedAt: Date
}

@Injectable()
export class AiChannelService {
  constructor(
    @InjectRepository(SysAiChannelEntity)
    private readonly channelRepository: Repository<SysAiChannelEntity>,
    @InjectRepository(SysAiModelEntity)
    private readonly modelRepository: Repository<SysAiModelEntity>,
    @InjectRepository(SysAiFeatureRouteEntity)
    private readonly routeRepository: Repository<SysAiFeatureRouteEntity>,
    private readonly credentialCipher: CredentialCipherService,
    @Inject(AI_ADAPTER_REGISTRY) private readonly adapterRegistry: AiAdapterRegistry,
  ) {}

  async list(): Promise<AiChannelView[]> {
    const channels = await this.channelRepository.find({ order: { updatedAt: 'DESC' } })
    return channels.map((channel) => this.toView(channel))
  }

  async create(input: {
    adapterCode: AiAdapterCode
    apiKey: string
    baseUrl: string
    code: string
    name: string
    supplier: string
    timeoutMs: number
    maxConcurrency: number
    maxQueuedRequests: number
  }): Promise<AiChannelView> {
    if (await this.channelRepository.exists({ where: { code: input.code } })) {
      throw new BadRequestException(`AI channel code already exists: ${input.code}`)
    }
    const channel = this.channelRepository.create({
      ...input,
      encryptedApiKey: this.credentialCipher.encrypt(input.apiKey),
      status: SysAiChannelStatus.DISABLED,
      lastCheckedAt: null,
      lastCheckMessage: null,
    })
    return this.toView(await this.channelRepository.save(channel))
  }

  async update(
    id: string,
    input: Partial<
      Pick<
        SysAiChannelEntity,
        'baseUrl' | 'maxConcurrency' | 'maxQueuedRequests' | 'name' | 'supplier' | 'timeoutMs'
      >
    >,
  ): Promise<AiChannelView> {
    const channel = await this.requireChannel(id)
    Object.assign(channel, input)
    channel.status = SysAiChannelStatus.DISABLED
    channel.lastCheckMessage = 'Channel configuration changed; connection test required'
    return this.toView(await this.channelRepository.save(channel))
  }

  async rotateCredential(id: string, apiKey: string): Promise<AiChannelView> {
    const channel = await this.requireChannel(id)
    channel.encryptedApiKey = this.credentialCipher.encrypt(apiKey)
    channel.credentialVersion += 1
    channel.status = SysAiChannelStatus.DISABLED
    channel.lastCheckMessage = 'Credential changed; connection test required'
    return this.toView(await this.channelRepository.save(channel))
  }

  async test(id: string, modelId: string, capability: AiCapability): Promise<AiChannelView> {
    const channel = await this.requireChannel(id)
    const model = await this.modelRepository.findOne({ where: { id: modelId } })
    if (!model) throw new NotFoundException(`AI model not found: ${modelId}`)
    this.assertCompatible(channel, model, capability)
    try {
      await this.adapterRegistry
        .get(channel.adapterCode)
        .execute(this.createProbeRequest(capability), this.resolveRoute(channel, model))
      channel.status = SysAiChannelStatus.DISABLED
      channel.lastCheckedAt = new Date()
      channel.lastCheckMessage = 'Connection test passed'
      return this.toView(await this.channelRepository.save(channel))
    } catch (error: unknown) {
      channel.status = SysAiChannelStatus.ERROR
      channel.lastCheckedAt = new Date()
      channel.lastCheckMessage = this.errorMessage(error).slice(0, 512)
      await this.channelRepository.save(channel)
      throw new BadRequestException(`AI channel test failed: ${channel.lastCheckMessage}`)
    }
  }

  async enable(id: string): Promise<AiChannelView> {
    const channel = await this.requireChannel(id)
    if (!channel.lastCheckedAt || channel.lastCheckMessage !== 'Connection test passed') {
      throw new BadRequestException('Test the AI channel before enabling it')
    }
    channel.status = SysAiChannelStatus.ACTIVE
    return this.toView(await this.channelRepository.save(channel))
  }

  async disable(id: string): Promise<AiChannelView> {
    const channel = await this.requireChannel(id)
    channel.status = SysAiChannelStatus.DISABLED
    return this.toView(await this.channelRepository.save(channel))
  }

  async remove(id: string): Promise<void> {
    const channel = await this.requireChannel(id)
    if (channel.status === SysAiChannelStatus.ACTIVE) {
      throw new BadRequestException('Disable the AI channel before deleting it')
    }
    if (await this.routeRepository.exists({ where: { channelId: id } })) {
      throw new BadRequestException('AI channel is still referenced by a feature route')
    }
    await this.channelRepository.delete(id)
  }

  private assertCompatible(
    channel: SysAiChannelEntity,
    model: SysAiModelEntity,
    capability: AiCapability,
  ): void {
    if (channel.adapterCode !== model.adapterCode) {
      throw new BadRequestException('AI channel and model must use the same protocol adapter')
    }
    if (
      !model.capabilities.includes(capability) ||
      !adapterSupportsCapability(model.adapterCode, capability)
    ) {
      throw new BadRequestException(`AI model does not support capability: ${capability}`)
    }
  }

  private createProbeRequest(capability: AiCapability): AiGatewayRequest {
    return capability === AiCapability.IMAGE_GENERATION
      ? {
          capability,
          featureCode: 'system.connection-test',
          prompt: 'Generate a simple test image',
        }
      : {
          capability,
          featureCode: 'system.connection-test',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK' }] }],
          temperature: 0,
        }
  }

  private resolveRoute(channel: SysAiChannelEntity, model: SysAiModelEntity): ResolvedAiRoute {
    return {
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
    }
  }

  private async requireChannel(id: string): Promise<SysAiChannelEntity> {
    const channel = await this.channelRepository.findOne({ where: { id } })
    if (!channel) throw new NotFoundException(`AI channel not found: ${id}`)
    return channel
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private toView(channel: SysAiChannelEntity): AiChannelView {
    return {
      adapterCode: channel.adapterCode,
      baseUrl: channel.baseUrl,
      code: channel.code,
      credentialVersion: channel.credentialVersion,
      hasApiKey: Boolean(channel.encryptedApiKey),
      id: channel.id,
      lastCheckedAt: channel.lastCheckedAt ?? null,
      lastCheckMessage: channel.lastCheckMessage ?? null,
      maxConcurrency: channel.maxConcurrency,
      maxQueuedRequests: channel.maxQueuedRequests,
      name: channel.name,
      status: channel.status,
      supplier: channel.supplier,
      timeoutMs: channel.timeoutMs,
      updatedAt: channel.updatedAt,
    }
  }
}
