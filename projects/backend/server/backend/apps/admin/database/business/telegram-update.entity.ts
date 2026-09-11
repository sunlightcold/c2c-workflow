import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

export enum TelegramUpdateStatus {
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('telegram_update_event')
@Index('uq_telegram_update_bot_update', ['botId', 'updateId'], { unique: true })
@Index('idx_telegram_update_tenant_status', ['tenantId', 'status'])
export class TelegramUpdateEventEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'uuid', update: false })
  botId: string

  @Column({ type: 'bigint', update: false })
  updateId: string

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>

  @Column({
    type: 'enum',
    enum: TelegramUpdateStatus,
    enumName: 'telegram_update_status_enum',
  })
  status: TelegramUpdateStatus

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null
}
