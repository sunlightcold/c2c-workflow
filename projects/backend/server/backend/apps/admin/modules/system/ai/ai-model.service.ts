import { AiAdapterCode, AiCapability } from '@/common/models'
import { SysAiFeatureRouteEntity } from '@admin/database/system/ai-feature-route.entity'
import { SysAiModelEntity } from '@admin/database/system/ai-model.entity'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { adapterSupportsCapability } from './ai-policy'

@Injectable()
export class AiModelService {
  constructor(
    @InjectRepository(SysAiModelEntity)
    private readonly modelRepository: Repository<SysAiModelEntity>,
    @InjectRepository(SysAiFeatureRouteEntity)
    private readonly routeRepository: Repository<SysAiFeatureRouteEntity>,
  ) {}

  list(): Promise<SysAiModelEntity[]> {
    return this.modelRepository.find({ order: { updatedAt: 'DESC' } })
  }

  async create(input: {
    adapterCode: AiAdapterCode
    capabilities: AiCapability[]
    code: string
    enabled: boolean
    name: string
    upstreamModel: string
  }): Promise<SysAiModelEntity> {
    this.assertCapabilities(input.adapterCode, input.capabilities)
    if (await this.modelRepository.exists({ where: { code: input.code } })) {
      throw new BadRequestException(`AI model code already exists: ${input.code}`)
    }
    return this.modelRepository.save(this.modelRepository.create(input))
  }

  async update(
    id: string,
    input: Partial<Pick<SysAiModelEntity, 'capabilities' | 'enabled' | 'name' | 'upstreamModel'>>,
  ): Promise<SysAiModelEntity> {
    const model = await this.requireModel(id)
    const capabilities = input.capabilities ?? model.capabilities
    this.assertCapabilities(model.adapterCode, capabilities)
    Object.assign(model, input)
    return this.modelRepository.save(model)
  }

  async remove(id: string): Promise<void> {
    await this.requireModel(id)
    if (await this.routeRepository.exists({ where: { modelId: id } })) {
      throw new BadRequestException('AI model is still referenced by a feature route')
    }
    await this.modelRepository.delete(id)
  }

  private assertCapabilities(adapterCode: AiAdapterCode, capabilities: AiCapability[]): void {
    const unsupported = capabilities.find(
      (capability) => !adapterSupportsCapability(adapterCode, capability),
    )
    if (unsupported) {
      throw new BadRequestException(`${adapterCode} does not support capability: ${unsupported}`)
    }
  }

  private async requireModel(id: string): Promise<SysAiModelEntity> {
    const model = await this.modelRepository.findOne({ where: { id } })
    if (!model) throw new NotFoundException(`AI model not found: ${id}`)
    return model
  }
}
