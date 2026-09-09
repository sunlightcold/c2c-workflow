import { TimestampEntity } from '@/common/entities'
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { SysAccessTokenEntity } from './access-token.entity'
import { SysUserEntity } from './user.entity'

export enum SysOnlineUserStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export const SysOnlineUserTableName = 'sys_online_user'

@Entity(SysOnlineUserTableName)
export class SysOnlineUserEntity extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // ip地址
  @Column({ type: 'varchar', length: 50 })
  ip: string

  // 操作系统
  @Column({ type: 'varchar', length: 50, nullable: true })
  os: string

  // 浏览器
  @Column({ type: 'varchar', length: 50, nullable: true })
  browser: string

  // 城市
  @Column({ type: 'varchar', length: 50, nullable: true })
  city?: string

  // 国家
  @Column({ type: 'varchar', length: 50, nullable: true })
  country?: string

  // 地区/省
  @Column({ type: 'varchar', length: 50, nullable: true })
  region?: string

  // 客户端 agent
  @Column({ type: 'varchar', length: 200, nullable: true })
  agent: string

  // 最近登录时间
  @Column({ type: 'timestamptz', nullable: true })
  loginAt: Date

  // 最近离线时间
  @Column({ type: 'timestamptz', nullable: true })
  logoutAt: Date

  // 在线状态
  @Column({ type: 'enum', enum: SysOnlineUserStatus, default: SysOnlineUserStatus.OFFLINE })
  status: SysOnlineUserStatus

  @ManyToOne(() => SysUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: SysUserEntity

  @ManyToOne(() => SysAccessTokenEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tokenId' })
  accessToken: SysAccessTokenEntity
}
