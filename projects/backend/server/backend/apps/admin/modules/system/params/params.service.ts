import { SysParamsEntity, SysParamsSource, SysParamsTypeEnum } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { toPaginationParams } from '@/common/dto'
import { StatusEnum } from '@/common/interfaces'
import { CacheService } from '@admin/modules/cache'
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { isNotEmpty } from 'class-validator'
import { paginate } from 'nestjs-typeorm-paginate'
import { Like, Repository } from 'typeorm'
import { ParamsCreateDto, ParamsFilterDto, ParamsUpdateDto } from './dto'
import { DEFAULT_SYSTEM_PARAMS } from './registry/default-system-params'

@Injectable()
export class ParamsService {
  @InjectRepository(SysParamsEntity) private readonly paramsRepository: Repository<SysParamsEntity>
  @Inject(CacheService) private readonly cacheService: CacheService

  private readonly logger = new Logger(ParamsService.name)

  /**
   * 外部调用，初始化系统参数进 Redis
   */
  async initRedis() {
    await this.cacheService.delAllSystemParams()
    const params = await this.paramsRepository.find()
    for (const item of params) {
      await this.cacheService.setSystemParams(item.key, item.value)
    }
  }

  async create(dto: ParamsCreateDto) {
    const params = await this.paramsRepository.save({
      ...dto,
      source: SysParamsSource.Custom,
      locked: StatusEnum.DISABLED,
    })
    await this.cacheService.setSystemParams(params.key, params.value)
  }

  async update(id: number, dto: ParamsUpdateDto) {
    const existingParam = await this.paramsRepository.findOne({ where: { id } })
    if (!existingParam) {
      throw new NotFoundException(`参数ID ${id} 不存在`)
    }
    this.assertEditableParam(existingParam, dto)
    await this.paramsRepository.update(id, dto)
    const updatedParam = await this.paramsRepository.findOne({ where: { id } })
    await this.cacheService.setSystemParams(updatedParam!.key, updatedParam!.value)

    if (existingParam.key !== updatedParam!.key) {
      await this.cacheService.delSystemParams(existingParam.key)
    }
  }

  async updateByKey(key: string, value: string) {
    await this.updateByKeys([{ key, value }])
  }

  async updateByKeys(values: readonly { key: string; value: string }[]) {
    if (values.length === 0) return

    await this.paramsRepository.manager.transaction(async (manager) => {
      for (const { key, value } of values) {
        const result = await manager.update(SysParamsEntity, { key }, { value })
        if (!result.affected) {
          throw new NotFoundException(`系统参数 ${key} 不存在`)
        }
      }
    })

    await Promise.all(values.map(({ key, value }) => this.cacheService.setSystemParams(key, value)))
  }

  async getValue(key: string) {
    const cached = await this.cacheService.getSystemParams(key)
    if (isNotEmpty(cached)) return cached

    const params = await this.paramsRepository.findOne({ where: { key } })
    if (!params) return undefined
    await this.cacheService.setSystemParams(params.key, params.value)
    return params.value
  }

  async delete(id: number) {
    const params = await this.paramsRepository.findOne({ where: { id } })
    if (!params) throw new NotFoundException(`参数ID ${id} 不存在`)
    const result = await this.paramsRepository.delete(id)
    if (result.affected && result.affected > 0) {
      await this.cacheService.delSystemParams(params.key)
      this.logger.log(`参数 ${params.key} (ID: ${id}) 已删除`)
    }
  }

  async checkSystemParams(id: number) {
    const params = await this.paramsRepository.findOne({ where: { id } })
    if (!params) throw new NotFoundException(`参数ID ${id} 不存在`)
    if (params.type === SysParamsTypeEnum.System) {
      throw new BadRequestException('系统参数不允许删除')
    }
    return true
  }

  async syncSystemParams() {
    this.validateDefinitions()
    for (const definition of DEFAULT_SYSTEM_PARAMS) {
      const current = await this.paramsRepository.findOne({ where: { key: definition.key } })
      if (current) {
        await this.paramsRepository.update(current.id, {
          name: definition.name,
          type: definition.type,
          description: definition.description,
          source: SysParamsSource.System,
          locked: StatusEnum.ENABLED,
        })
      } else {
        await this.paramsRepository.save({
          ...definition,
          source: SysParamsSource.System,
          locked: StatusEnum.ENABLED,
        })
      }
    }
  }

  filter(dto: ParamsFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { key, value, name, description, type } = params
    const queryBuilder = this.paramsRepository.createQueryBuilder().andWhere({
      ...(key ? { key: Like(`%${key}%`) } : null),
      ...(value ? { value: Like(`%${value}%`) } : null),
      ...(name ? { name: Like(`%${name}%`) } : null),
      ...(description ? { description: Like(`%${description}%`) } : null),
      ...(isNotEmpty(type) ? { type } : null),
    })
    return paginate(queryBuilder, paginateOptions)
  }

  private validateDefinitions() {
    const keys = new Set<string>()
    for (const definition of DEFAULT_SYSTEM_PARAMS) {
      if (keys.has(definition.key)) {
        throw new BadRequestException(`系统参数 key 重复: ${definition.key}`)
      }
      keys.add(definition.key)
    }
  }

  private assertEditableParam(param: SysParamsEntity, dto: ParamsUpdateDto) {
    if (param.source !== SysParamsSource.System && param.locked !== StatusEnum.ENABLED) return

    const payload = dto as Record<string, unknown>
    const structuralFields = ['key', 'type', 'source', 'locked']
    const hasStructuralChange = structuralFields.some((field) => Reflect.has(payload, field))
    if (hasStructuralChange) {
      throw new BadRequestException(ErrorEnum.PARAM_SYSTEM_LOCKED)
    }
  }
}
