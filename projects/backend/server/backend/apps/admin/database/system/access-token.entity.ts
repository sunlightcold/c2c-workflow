import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { SysUserEntity } from './user.entity'

export const SysAccessTokenTableName = 'sys_access_token'

@Entity(SysAccessTokenTableName)
@Index(['expiredAt'])
export class SysAccessTokenEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @CreateDateColumn({ type: 'timestamptz', comment: '令牌创建时间' })
  createdAt: Date

  @Column({ type: 'timestamptz', comment: '令牌过期时间' })
  expiredAt: Date

  // 令牌值
  @Column({ type: 'varchar' })
  value: string

  @ManyToOne(() => SysUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: SysUserEntity
}
