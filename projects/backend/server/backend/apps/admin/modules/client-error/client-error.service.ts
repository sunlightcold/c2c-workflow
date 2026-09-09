import { SysClientErrorEventEntity } from '@/apps/admin/database'
import { toPaginationParams } from '@/common/dto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { paginate } from 'nestjs-typeorm-paginate'
import { LessThan, Repository } from 'typeorm'
import { ClientErrorCreateDto, ClientErrorFilterDto } from './dto'

export interface ClientErrorRequestContext {
  ip: string
  userAgent?: string
}

@Injectable()
export class ClientErrorService {
  constructor(
    @InjectRepository(SysClientErrorEventEntity)
    private readonly repository: Repository<SysClientErrorEventEntity>,
  ) {}

  async create(dto: ClientErrorCreateDto, context: ClientErrorRequestContext) {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({
        ...dto,
        breadcrumbs: dto.breadcrumbs ?? [],
        ip: context.ip,
        occurredAt: new Date(dto.occurredAt),
        userAgent: context.userAgent?.slice(0, 500),
      })
      .orIgnore()
      .execute()
    return { eventId: dto.eventId }
  }

  filter(dto: ClientErrorFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const query = this.repository.createQueryBuilder('event')
    if (params.appCode) query.andWhere('event.appCode = :appCode', { appCode: params.appCode })
    if (params.release) query.andWhere('event.release = :release', { release: params.release })
    if (params.platform) query.andWhere('event.platform = :platform', { platform: params.platform })
    if (params.level) query.andWhere('event.level = :level', { level: params.level })
    if (params.source) query.andWhere('event.source = :source', { source: params.source })
    if (params.startedAt)
      query.andWhere('event.occurredAt >= :startedAt', { startedAt: params.startedAt })
    if (params.endedAt) query.andWhere('event.occurredAt < :endedAt', { endedAt: params.endedAt })
    if (params.keyword) {
      query.andWhere(
        `(event.message ILIKE :keyword OR event.errorType ILIKE :keyword OR event.route ILIKE :keyword)`,
        { keyword: `%${params.keyword}%` },
      )
    }
    return paginate(query.orderBy('event.occurredAt', 'DESC'), paginateOptions)
  }

  async findOne(eventId: string) {
    const event = await this.repository.findOneBy({ eventId })
    if (!event) throw new NotFoundException('客户端错误事件不存在')
    return event
  }

  async remove(eventId: string) {
    const result = await this.repository.delete({ eventId })
    if (!result.affected) throw new NotFoundException('客户端错误事件不存在')
  }

  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    const result = await this.repository.delete({ createdAt: LessThan(cutoff) })
    return result.affected ?? 0
  }
}
