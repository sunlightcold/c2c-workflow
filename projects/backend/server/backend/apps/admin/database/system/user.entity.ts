import { TraceableEntity } from '@/common/entities'
import { ActorType, StatusEnum } from '@/common/interfaces'
import { BeforeInsert, Column, Entity, JoinTable, ManyToMany } from 'typeorm'
import { SysRoleEntity } from './role.entity'

export const SysUserTableName = 'sys_user'

@Entity(SysUserTableName)
export class SysUserEntity extends TraceableEntity {
  @Column({
    type: 'enum',
    enum: ActorType,
    enumName: 'actor_type_enum',
    default: ActorType.PLATFORM,
  })
  actorType: ActorType

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null

  @Column({ type: 'integer', default: 1 })
  authzVersion: number

  @Column({ type: 'varchar' })
  salt: string

  // 用户名
  @Column({ type: 'varchar', length: 20, unique: true, update: false })
  username: string

  // 邮箱
  @Column({ type: 'varchar', nullable: true, unique: true })
  email?: string

  // 用户密码
  @Column({ type: 'varchar', length: 40 })
  password: string

  // 状态：1启用，0禁用
  @Column({ type: 'int', default: StatusEnum.ENABLED })
  status: StatusEnum

  // 用户昵称
  @Column({ type: 'varchar' })
  nickname: string

  // 用户头像
  @Column({ type: 'varchar', nullable: true })
  avatar?: string

  // opt 验证秘钥
  @Column({ type: 'varchar', nullable: true })
  otpSecret?: string

  // 是否已启用OTP
  @Column({ type: 'boolean', default: false })
  isOtpEnabled: boolean

  // 用户备注
  @Column({ type: 'varchar', length: 100, nullable: true })
  description?: string

  // 关联角色ID集合
  @ManyToMany(() => SysRoleEntity, (role) => role.users)
  @JoinTable({
    name: 'sys_user_role',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles: SysRoleEntity[]

  @BeforeInsert()
  setDefaultNickname() {
    if (!this.nickname) {
      this.nickname = this.username
    }
  }
}
