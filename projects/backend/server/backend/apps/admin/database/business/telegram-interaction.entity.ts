import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

export enum TelegramInteractionState {
  PENDING = 'PENDING',
  SUBMITTING = 'SUBMITTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum TelegramInteractionAction {
  CREATE_MANUAL_PAYMENTS = 'CREATE_MANUAL_PAYMENTS',
  SUBMIT_PAYMENT_BATCHES = 'SUBMIT_PAYMENT_BATCHES',
}

@Entity('telegram_interaction_context')
@Index('idx_telegram_interaction_scope', ['tenantId', 'botId', 'chatId', 'state'])
@Index('idx_telegram_interaction_expiry', ['state', 'expiresAt'])
export class TelegramInteractionContextEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) botId: string
  @Column({ type: 'uuid', update: false }) groupId: string
  @Column({ type: 'varchar', length: 32, update: false }) chatId: string
  @Column({ type: 'varchar', length: 32, update: false }) telegramUserId: string
  @Column({ type: 'integer', update: false }) sourceMessageId: number
  @Column({ type: 'varchar', length: 64, update: false }) action: TelegramInteractionAction
  @Column({ type: 'jsonb', update: false }) payload: Record<string, unknown>
  @Column({ type: 'varchar', length: 16 }) state: TelegramInteractionState
  @Column({ type: 'timestamptz', update: false }) expiresAt: Date
  @Column({ type: 'varchar', length: 500, nullable: true }) lastError: string | null
}
