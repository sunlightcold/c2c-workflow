import { StatusEnum } from '@/common/interfaces'
import { TraceableEntity } from '@/common/entities'
import { Column, Entity, ManyToMany, Relation } from 'typeorm'
import { SysRoleEntity } from './role.entity'

export enum SysMenuType {
  // 菜单
  MENU = 'MENU',
  // 目录
  FOLDER = 'FOLDER',
  // 权限
  PERMISSION = 'PERMISSION',
  // 内嵌外链
  EMBED = 'EMBED',
}

export enum SysMenuSource {
  // 系统内置，由代码注册表维护
  System = 'system',
  // 管理端用户自定义
  Custom = 'custom',
}

export const SysMenuTableName = 'sys_menu'

@Entity(SysMenuTableName)
export class SysMenuEntity extends TraceableEntity {
  // 稳定菜单标识，系统内置菜单必须有值
  @Column({ type: 'varchar', length: 120, nullable: true, unique: true, comment: '菜单稳定标识' })
  key?: string

  // 菜单来源
  @Column({ type: 'enum', enum: SysMenuSource, default: SysMenuSource.Custom, comment: '菜单来源' })
  source: SysMenuSource

  // 是否锁定结构配置
  @Column({ enum: StatusEnum, type: 'int', default: StatusEnum.DISABLED, comment: '是否锁定' })
  locked: StatusEnum

  // 系统菜单定义摘要，用于识别代码注册表变更
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '系统菜单定义摘要' })
  managedHash?: string

  // 上级菜单ID
  @Column({ type: 'int', nullable: true })
  parentId?: number | null

  // 菜单名称
  @Column({ type: 'varchar', length: 20 })
  name: string

  // 路由地址
  @Column({ type: 'varchar', length: 100, nullable: true })
  path?: string

  // 组件路径
  @Column({ type: 'varchar', length: 100, nullable: true })
  component?: string

  // 权限标识
  @Column({ type: 'varchar', length: 100, nullable: true })
  permission?: string

  // 权限标识
  @Column({ type: 'enum', enum: SysMenuType })
  type: SysMenuType

  // 菜单图标
  @Column({ type: 'varchar', nullable: true })
  icon?: string

  // 内嵌外链地址
  @Column({ type: 'varchar', nullable: true })
  iframeSrc?: string

  // 状态：1启用，0禁用
  @Column({ enum: StatusEnum, type: 'int', default: StatusEnum.ENABLED })
  status: StatusEnum

  // 是否缓存菜单：1启用，0禁用
  @Column({ enum: StatusEnum, type: 'int', default: StatusEnum.ENABLED })
  keepAlive: StatusEnum

  // 是否显示：1启用，0禁用
  @Column({ type: 'enum', enum: StatusEnum, default: StatusEnum.ENABLED })
  show: StatusEnum

  // 排序编号
  @Column({ type: 'int', default: 0 })
  orderNo?: number

  @ManyToMany(() => SysRoleEntity, (role) => role.menus, { onDelete: 'CASCADE' })
  roles: Relation<SysRoleEntity[]>
}
