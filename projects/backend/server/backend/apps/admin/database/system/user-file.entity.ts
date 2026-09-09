import { CommonEntity } from '@/common/entities'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { SysStaticFileEntity } from './static-file.entity'
import { SysUserEntity } from './user.entity'

export enum SysStaticTypeEnum {
  AVATAR = 'avatar',
  IMAGE = 'image',
  Temp = 'temp',
}

export enum SysFileAccessEnum {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export const SysUserFileTableName = 'sys_user_file'

@Entity(SysUserFileTableName)
export class SysUserFileEntity extends CommonEntity {
  @Column({ comment: '文件类型', type: 'enum', enum: SysStaticTypeEnum })
  type: SysStaticTypeEnum

  @Column({ comment: '文件访问权限：私有或公有', type: 'enum', enum: SysFileAccessEnum })
  access: SysFileAccessEnum

  @ManyToOne(() => SysUserEntity)
  @JoinColumn({ name: 'userId' })
  user: SysUserEntity

  @ManyToOne(() => SysStaticFileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fileId' })
  file: SysStaticFileEntity
}
