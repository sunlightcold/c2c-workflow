import { AiCapability } from '@/common/models'
import { SysAiChannelEntity } from '@admin/database/system/ai-channel.entity'
import { SysAiFeatureRouteEntity } from '@admin/database/system/ai-feature-route.entity'
import { SysAiModelEntity } from '@admin/database/system/ai-model.entity'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { adapterSupportsCapability } from './ai-policy'

export interface AiFeatureRouteView {
  capability: AiCapability
  channel: {
    adapterCode: SysAiChannelEntity['adapterCode']
    code: string
    id: string
    name: string
    status: SysAiChannelEntity['status']
    supplier: string
  }
  channelId: string
  enabled: boolean
  featureCode: string
  id: string
  model: {
    adapterCode: SysAiModelEntity['adapterCode']
    code: string
    enabled: boolean
    id: string
    name: string
    upstreamModel: string
  }
  modelId: string
  priority: number
  updatedAt: Date
}

@Injectable()
export class AiFeatureRouteService {
  constructor(
    @InjectRepository(SysAiFeatureRouteEntity)
    private readonly routeRepository: Repository<SysAiFeatureRouteEntity>,
    @InjectRepository(SysAiChannelEntity)
    private readonly channelRepository: Repository<SysAiChannelEntity>,
    @InjectRepository(SysAiModelEntity)
    private readonly modelRepository: Repository<SysAiModelEntity>,
  ) {}

  async list(featureCode?: string): Promise<AiFeatureRouteView[]> {
    const routes = await this.routeRepository.find({
      ...(featureCode ? { where: { featureCode } } : {}),
      relations: { channel: true, model: true },
      order: { featureCode: 'ASC', priority: 'ASC' },
    })
    return routes.map((route) => this.toView(route))
  }

  async create(input: {
    capability: AiCapability
    channelId: string
    enabled: boolean
    featureCode: string
    modelId: string
    priority: number
  }): Promise<SysAiFeatureRouteEntity> {
    const [channel, model] = await Promise.all([
      this.channelRepository.findOne({ where: { id: input.channelId } }),
      this.modelRepository.findOne({ where: { id: input.modelId } }),
    ])
    if (!channel) throw new NotFoundException(`AI channel not found: ${input.channelId}`)
    if (!model) throw new NotFoundException(`AI model not found: ${input.modelId}`)
    this.assertCompatible(channel, model, input.capability)
    if (
      await this.routeRepository.exists({
        where: { featureCode: input.featureCode, priority: input.priority },
      })
    ) {
      throw new BadRequestException('AI feature route priority already exists')
    }
    return this.routeRepository.save(this.routeRepository.create(input))
  }

  async update(
    id: string,
    input: Partial<Pick<SysAiFeatureRouteEntity, 'enabled' | 'priority'>>,
  ): Promise<SysAiFeatureRouteEntity> {
    const route = await this.requireRoute(id)
    if (input.priority !== undefined && input.priority !== route.priority) {
      return this.swapPriority(route, input)
    }
    Object.assign(route, input)
    return this.routeRepository.save(route)
  }

  async remove(id: string): Promise<void> {
    await this.requireRoute(id)
    await this.routeRepository.delete(id)
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

  private async swapPriority(
    currentRoute: SysAiFeatureRouteEntity,
    input: Partial<Pick<SysAiFeatureRouteEntity, 'enabled' | 'priority'>>,
  ): Promise<SysAiFeatureRouteEntity> {
    const targetPriority = input.priority
    if (targetPriority === undefined) return currentRoute
    return this.routeRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(SysAiFeatureRouteEntity)
      const routes = await repository.find({
        where: { featureCode: currentRoute.featureCode },
        lock: { mode: 'pessimistic_write' },
        order: { priority: 'ASC' },
      })
      const route = routes.find((candidate) => candidate.id === currentRoute.id)
      if (!route) throw new NotFoundException(`AI feature route not found: ${currentRoute.id}`)
      const displaced = routes.find((candidate) => candidate.priority === targetPriority)
      const previousPriority = route.priority
      if (displaced) {
        displaced.priority = Math.max(...routes.map(({ priority }) => priority)) + 1
        await repository.save(displaced)
      }
      route.priority = targetPriority
      if (input.enabled !== undefined) route.enabled = input.enabled
      const updated = await repository.save(route)
      if (displaced) {
        displaced.priority = previousPriority
        await repository.save(displaced)
      }
      return updated
    })
  }

  private async requireRoute(id: string): Promise<SysAiFeatureRouteEntity> {
    const route = await this.routeRepository.findOne({ where: { id } })
    if (!route) throw new NotFoundException(`AI feature route not found: ${id}`)
    return route
  }

  private toView(route: SysAiFeatureRouteEntity): AiFeatureRouteView {
    if (!route.channel || !route.model) {
      throw new Error(`AI feature route relations were not loaded: ${route.id}`)
    }
    return {
      capability: route.capability,
      channel: {
        adapterCode: route.channel.adapterCode,
        code: route.channel.code,
        id: route.channel.id,
        name: route.channel.name,
        status: route.channel.status,
        supplier: route.channel.supplier,
      },
      channelId: route.channelId,
      enabled: route.enabled,
      featureCode: route.featureCode,
      id: route.id,
      model: {
        adapterCode: route.model.adapterCode,
        code: route.model.code,
        enabled: route.model.enabled,
        id: route.model.id,
        name: route.model.name,
        upstreamModel: route.model.upstreamModel,
      },
      modelId: route.modelId,
      priority: route.priority,
      updatedAt: route.updatedAt,
    }
  }
}
