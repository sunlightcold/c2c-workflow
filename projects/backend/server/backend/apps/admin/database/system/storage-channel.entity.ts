import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

export const SysStorageChannelTableName = 'sys_storage_channel'

export enum SysStorageChannelProvider {
  S3_COMPATIBLE = 's3_compatible',
}

export enum SysStorageChannelStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  ERROR = 'error',
}

@Entity(SysStorageChannelTableName)
@Index('uq_sys_storage_channel_code', ['code'], { unique: true })
export class SysStorageChannelEntity extends CommonUuidEntity {
  @Column({ type: 'varchar', length: 64, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({
    type: 'enum',
    enum: SysStorageChannelProvider,
    enumName: 'sys_storage_channel_provider_enum',
  })
  provider: SysStorageChannelProvider

  @Column({ type: 'varchar', length: 512, update: false })
  endpoint: string

  @Column({ type: 'varchar', length: 64, default: 'auto', update: false })
  region: string

  @Column({ type: 'varchar', length: 128, update: false })
  bucket: string

  @Column({ type: 'varchar', length: 512, nullable: true })
  publicBaseUrl?: string | null

  @Column({ type: 'boolean', default: true, update: false })
  forcePathStyle: boolean

  @Column({ type: 'varchar', length: 255 })
  accessKeyId: string

  @Column({ type: 'text' })
  encryptedSecretAccessKey: string

  @Column({ type: 'integer', default: 1 })
  credentialVersion: number

  @Column({
    type: 'enum',
    enum: SysStorageChannelStatus,
    enumName: 'sys_storage_channel_status_enum',
    default: SysStorageChannelStatus.DISABLED,
  })
  status: SysStorageChannelStatus

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt?: Date | null

  @Column({ type: 'varchar', length: 512, nullable: true })
  lastCheckMessage?: string | null
}
