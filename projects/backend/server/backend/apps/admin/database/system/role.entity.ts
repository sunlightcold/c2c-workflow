import { TraceableEntity } from '@/common/entities'
import { StatusEnum } from '@/common/interfaces'
import { Column, Entity, JoinTable, ManyToMany, Relation } from 'typeorm'
import { SysMenuEntity } from './menu.entity'
import { SysUserEntity } from './user.entity'

export const SysRoleTableName = 'sys_role'

@Entity(SysRoleTableName)
export class SysRoleEntity extends TraceableEntity {
  // 角色标识
  @Column({ type: 'varchar', length: 20, unique: true, update: false })
  value: string

  // 角色名称
  @Column({ type: 'varchar', length: 20 })
  name: string

  // 状态：1启用，0禁用
  @Column({ enum: StatusEnum, type: 'int', default: StatusEnum.ENABLED })
  status: StatusEnum

  // 角色描述
  @Column({ type: 'varchar', length: 100, nullable: true })
  description?: string

  @ManyToMany(() => SysMenuEntity, (menu) => menu.roles)
  @JoinTable({
    name: 'sys_role_menu',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'menuId', referencedColumnName: 'id' },
  })
  menus: Relation<SysMenuEntity[]>

  @ManyToMany(() => SysUserEntity, (user) => user.roles)
  users: Relation<SysUserEntity[]>
}
