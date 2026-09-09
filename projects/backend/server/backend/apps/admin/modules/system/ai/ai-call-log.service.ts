import { SysAiCallLogEntity } from '@admin/database'
import { toPaginationParams } from '@/common/dto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { paginate } from 'nestjs-typeorm-paginate'
import { Repository } from 'typeorm'
import { AiAdapterCode, AiCallLogStatus, AiCapability } from './ai.types'

export interface AiCallLogRecord {
  adapterCode: AiAdapterCode
  attempt: number
  capability: AiCapability
  channelCode: string
  durationMs: number
  endedAt: Date
  errorMessage?: string
  errorType?: string
  featureCode: string
  inputTokens?: number
  modelCode: string
  outputTokens?: number
  requestId?: string
  startedAt: Date
  status: AiCallLogStatus
  totalTokens?: number
  userId?: string
}

export interface AiCallLogFilter {
  pageIndex: number
  pageSize: number
  featureCode?: string
  capability?: AiCapability
  status?: AiCallLogStatus
  channelCode?: string
  modelCode?: string
  startedAt?: Date | string
  endedAt?: Date | string
}

@Injectable()
export class AiCallLogService {
  constructor(
    @InjectRepository(SysAiCallLogEntity)
    private readonly repository: Repository<SysAiCallLogEntity>,
  ) {}

  async record(input: AiCallLogRecord): Promise<void> {
    await this.repository.insert(input)
  }

  filter(input: AiCallLogFilter) {
    const { paginateOptions, params } = toPaginationParams(input)
    const query = this.applyFilters(this.repository.createQueryBuilder('log'), params)
    return paginate(query.orderBy('log.startedAt', 'DESC'), paginateOptions)
  }

  async stats(input: Omit<AiCallLogFilter, 'pageIndex' | 'pageSize'>) {
    const query = this.applyFilters(this.repository.createQueryBuilder('log'), input)
    const [summary, capabilities, features] = await Promise.all([
      query
        .clone()
        .select('COUNT(*)', 'total')
        .addSelect("COUNT(*) FILTER (WHERE log.status = 'success')", 'success')
        .addSelect("COUNT(*) FILTER (WHERE log.status = 'failed')", 'failed')
        .getRawOne<{ total: string; success: string; failed: string }>(),
      query
        .clone()
        .select('log.capability', 'capability')
        .addSelect('COUNT(*)', 'count')
        .groupBy('log.capability')
        .getRawMany<{ capability: AiCapability; count: string }>(),
      query
        .clone()
        .select('log.featureCode', 'featureCode')
        .addSelect('COUNT(*)', 'count')
        .groupBy('log.featureCode')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany<{ featureCode: string; count: string }>(),
    ])
    return {
      total: Number(summary?.total ?? 0),
      success: Number(summary?.success ?? 0),
      failed: Number(summary?.failed ?? 0),
      byCapability: capabilities.map((row) => ({
        capability: row.capability,
        count: Number(row.count),
      })),
      byFeature: features.map((row) => ({
        featureCode: row.featureCode,
        count: Number(row.count),
      })),
    }
  }

  private applyFilters(
    query: ReturnType<Repository<SysAiCallLogEntity>['createQueryBuilder']>,
    input: Omit<AiCallLogFilter, 'pageIndex' | 'pageSize'>,
  ) {
    if (input.featureCode)
      query.andWhere('log.featureCode = :featureCode', { featureCode: input.featureCode })
    if (input.capability)
      query.andWhere('log.capability = :capability', { capability: input.capability })
    if (input.status) query.andWhere('log.status = :status', { status: input.status })
    if (input.channelCode)
      query.andWhere('log.channelCode = :channelCode', { channelCode: input.channelCode })
    if (input.modelCode)
      query.andWhere('log.modelCode = :modelCode', { modelCode: input.modelCode })
    if (input.startedAt)
      query.andWhere('log.startedAt >= :startedAt', { startedAt: input.startedAt })
    if (input.endedAt) query.andWhere('log.startedAt < :endedAt', { endedAt: input.endedAt })
    return query
  }
}
