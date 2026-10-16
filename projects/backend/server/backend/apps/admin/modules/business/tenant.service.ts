import { BusinessStatus, TenantEntity, TenantType } from '@admin/database'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Repository } from 'typeorm'
import { BusinessNoPrefix, IdUtils } from '@/common/utils/id'

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly repository: Repository<TenantEntity>,
    private readonly events: EventEmitter2,
  ) {}

  list() {
    return this.repository.find({ order: { type: 'ASC', createdAt: 'ASC' } })
  }

  async create(input: { name: string; timezone: string }) {
    return this.repository.save(
      this.repository.create({
        ...input,
        code: IdUtils.generateBusinessNo(BusinessNoPrefix.AGENT),
        type: TenantType.AGENT,
        status: BusinessStatus.ACTIVE,
        systemLocked: false,
      }),
    )
  }

  async setStatus(id: string, status: BusinessStatus) {
    const tenant = await this.repository.findOne({ where: { id } })
    if (!tenant) throw new BadRequestException('所属单位不存在')
    if (tenant.systemLocked && status !== BusinessStatus.ACTIVE)
      throw new BadRequestException('总部自营所属单位不可停用')
    tenant.status = status
    const saved = await this.repository.save(tenant)
    this.events.emit('merchant-chat.configuration-changed', { tenantId: id })
    return saved
  }
}
