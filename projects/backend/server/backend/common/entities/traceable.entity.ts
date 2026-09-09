import { Column } from 'typeorm'
import { CommonEntity, CommonUuidEntity } from './common.entity'

export abstract class TraceableEntity extends CommonEntity {
  @Column({ update: false, comment: '创建人', nullable: true })
  createBy: number

  @Column({ comment: '更新人', nullable: true })
  updateBy: number
}

export abstract class TraceableUuidEntity extends CommonUuidEntity {
  @Column({ update: false, comment: '创建人', nullable: true })
  createBy: number

  @Column({ comment: '更新人', nullable: true })
  updateBy: number
}
