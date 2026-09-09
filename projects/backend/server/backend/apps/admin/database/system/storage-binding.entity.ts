import { TimestampEntity } from '@/common/entities'
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { SysStorageChannelEntity } from './storage-channel.entity'

export const SysStorageBindingTableName = 'sys_storage_binding'

@Entity(SysStorageBindingTableName)
export class SysStorageBindingEntity extends TimestampEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  purposeCode: string

  @Column({ type: 'uuid' })
  channelId: string

  @Column({ type: 'varchar', length: 128, nullable: true })
  keyPrefixOverride?: string | null

  @Column({ type: 'integer', nullable: true })
  updatedBy?: number | null

  @ManyToOne(() => SysStorageChannelEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channelId' })
  channel?: SysStorageChannelEntity
}
