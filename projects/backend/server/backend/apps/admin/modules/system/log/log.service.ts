import { SysLogEntity } from '@/apps/admin/database'
import { toPaginationParams } from '@/common/dto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { paginate } from 'nestjs-typeorm-paginate'
import { Like, Repository } from 'typeorm'
import { LogCreateDto, LogFilterDto } from './dto'

@Injectable()
export class LogService {
  @InjectRepository(SysLogEntity) private readonly logRepository: Repository<SysLogEntity>
  async create(dto: LogCreateDto) {
    await this.logRepository.save(dto)
  }

  filter(dto: LogFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { title, content } = params
    return paginate(
      this.logRepository
        .createQueryBuilder('log')
        .andWhere({
          ...(title && { title: Like(`%${title}%`) }),
          ...(content && { content: Like(`%${content}%`) }),
        })
        .orderBy({ 'log.createdAt': 'DESC' }),
      paginateOptions,
    )
  }

  async clear() {
    await this.logRepository.deleteAll()
  }
}
