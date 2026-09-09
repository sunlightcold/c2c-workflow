import { TraceableEntity } from '@/common/entities'
import { Column, Entity } from 'typeorm'

export enum SysParamsTypeEnum {
  System = 1,
  Normal = 2,
}

export enum SysParamsSource {
  System = 'system',
  Custom = 'custom',
}

export const SysParamsTableName = 'sys_params'

@Entity(SysParamsTableName)
export class SysParamsEntity extends TraceableEntity {
  @Column({
    type: 'enum',
    enum: SysParamsSource,
    default: SysParamsSource.Custom,
    comment: '参数来源',
  })
  source: SysParamsSource

  @Column({ type: 'int', default: 0, comment: '是否锁定' })
  locked: number

  @Column({ type: 'varchar', comment: '参数名称' })
  name: string

  @Column({ type: 'varchar', unique: true, comment: '参数键' })
  key: string

  @Column({ type: 'varchar', comment: '参数值' })
  value: string

  @Column({ enum: SysParamsTypeEnum, type: 'int', comment: '参数类型' })
  type: SysParamsTypeEnum

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '描述' })
  description?: string
}
