import { TraceableEntity } from '@/common/entities'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { SysUserEntity } from './user.entity'

export const SysStaticTableName = 'sys_static'

@Entity(SysStaticTableName)
export class SysStaticEntity extends TraceableEntity {
  @Column({ comment: '文件名称', type: 'varchar' })
  name: string

  @Column({ comment: '文件路径', type: 'varchar' })
  path: string

  @Column({ comment: '文件后缀', type: 'varchar' })
  ext: string

  @Column({ comment: '文件大小', type: 'bigint' })
  size: number

  @ManyToOne(() => SysUserEntity, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: SysUserEntity
}
