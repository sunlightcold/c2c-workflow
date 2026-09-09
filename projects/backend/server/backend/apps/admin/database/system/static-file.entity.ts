import { TraceableEntity } from '@/common/entities'
import { Column, Entity } from 'typeorm'

export const SysStaticFileTableName = 'sys_static_file'

@Entity(SysStaticFileTableName)
export class SysStaticFileEntity extends TraceableEntity {
  @Column({ comment: '文件名称', type: 'varchar' })
  name: string

  @Column({ comment: '文件路径', type: 'varchar' })
  path: string

  @Column({ comment: '文件后缀', type: 'varchar' })
  ext: string

  @Column({ comment: '文件大小', type: 'bigint' })
  size: number

  @Column({ comment: '文件 Hash', type: 'varchar' })
  hash: string

  @Column({ comment: '文件应用计数', type: 'int', default: 1 })
  refCount: number
}
