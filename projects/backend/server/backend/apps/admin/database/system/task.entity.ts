import { TraceableUuidEntity } from '@/common/entities'
import { Column, Entity } from 'typeorm'

export enum SysTaskTypeEnum {
  Cron = 'Cron',
  Interval = 'Interval',
}

export enum SysTaskStatus {
  Disabled = 0,
  Activated = 1,
}

export enum SysTaskSource {
  Custom = 'custom',
  System = 'system',
}

export const SysTaskTableName = 'sys_task'

@Entity(SysTaskTableName)
export class SysTaskEntity extends TraceableUuidEntity {
  @Column({ type: 'enum', enum: SysTaskSource, default: SysTaskSource.Custom, comment: '任务来源' })
  source: SysTaskSource

  @Column({ type: 'varchar', length: 20, comment: '任务名称' })
  name: string

  @Column({ type: 'varchar', length: 100, comment: '任务标识' })
  service: string

  @Column({ type: 'enum', enum: SysTaskTypeEnum, comment: '任务类型' })
  type: SysTaskTypeEnum

  @Column({ type: 'enum', enum: SysTaskStatus, comment: '状态：1启用，0禁用' })
  status: SysTaskStatus

  @Column({ type: 'timestamptz', nullable: true, comment: '开始时间' })
  startedAt: Date

  @Column({ type: 'timestamptz', nullable: true, comment: '结束时间' })
  endedAt: Date

  @Column({ type: 'int', nullable: true, comment: '执行间隔' })
  limit: number

  @Column({ type: 'varchar', nullable: true, comment: 'corn表达式' })
  cron: string

  @Column({ type: 'int', nullable: true, comment: '执行次数' })
  every: number

  @Column({ type: 'text', nullable: true, comment: '任务参数' })
  data: string

  @Column({ type: 'text', nullable: true, comment: '任务配置' })
  jobOpts?: string

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '任务描述' })
  description?: string
}
