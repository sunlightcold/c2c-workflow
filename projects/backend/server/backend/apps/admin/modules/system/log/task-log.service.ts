import { SysTaskLogEntity } from '@/apps/admin/database'
import { toPaginationParams } from '@/common/dto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { isNotEmpty } from 'class-validator'
import { paginate } from 'nestjs-typeorm-paginate'
import { LessThan, Like, Repository } from 'typeorm'
import { TaskLogCreateDto, TaskLogFilterDto } from './dto'

@Injectable()
export class TaskLogService {
  @InjectRepository(SysTaskLogEntity)
  private readonly taskLogRepository: Repository<SysTaskLogEntity>

  async create(dto: TaskLogCreateDto) {
    const { taskId, taskSource, ...data } = dto
    await this.taskLogRepository.save({ task: { id: taskId }, taskSource, ...data })
  }

  filter(dto: TaskLogFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { taskName, status, taskSource } = params
    return paginate(
      this.taskLogRepository
        .createQueryBuilder('taskLog')
        .andWhere({
          ...(taskName ? { taskName: Like(`%${taskName}%`) } : null),
          ...(isNotEmpty(status) ? { status } : null),
          ...(taskSource ? { taskSource } : null),
        })
        .loadRelationIdAndMap('taskLog.taskId', 'taskLog.task')
        .orderBy('taskLog.startedAt', 'DESC')
        .addOrderBy('taskLog.id', 'DESC'),
      paginateOptions,
    )
  }

  async clearBefore(cutoff: Date) {
    const result = await this.taskLogRepository.delete({ startedAt: LessThan(cutoff) })
    return result.affected ?? 0
  }
}
