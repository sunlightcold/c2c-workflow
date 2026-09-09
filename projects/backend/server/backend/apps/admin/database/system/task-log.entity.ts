import { ExecuteEnum } from '@/common/interfaces'
import { CommonEntity } from '@/common/entities'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { SysTaskEntity, SysTaskSource } from './task.entity'

export const SysTaskLogTableName = 'sys_task_log'

@Entity(SysTaskLogTableName)
export class SysTaskLogEntity extends CommonEntity {
  @Column({ comment: '任务来源', enum: SysTaskSource, type: 'enum', default: SysTaskSource.Custom })
  taskSource: SysTaskSource

  @Column({ comment: '任务执行结果', enum: ExecuteEnum, type: 'int' })
  status: ExecuteEnum

  @Column({ comment: '任务日志信息', type: 'text', nullable: true })
  detail?: string

  @Column({ comment: '任务耗时', type: 'int', default: 0 })
  consumeTime: number

  @Column({ comment: '任务开始时间', type: 'timestamptz' })
  startedAt: Date

  @Column({ comment: '任务结束时间', type: 'timestamptz', nullable: true })
  endedAt: Date

  @Column({ comment: '任务名称', type: 'varchar' })
  taskName: string

  @ManyToOne(() => SysTaskEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'taskId' })
  task: SysTaskEntity
}
