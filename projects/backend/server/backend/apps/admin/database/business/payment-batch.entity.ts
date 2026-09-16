import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index, VersionColumn } from 'typeorm'

export enum PaymentBatchStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  READY = 'READY',
  SUBMITTING = 'SUBMITTING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  CANCELLED = 'CANCELLED',
  EXCEPTION = 'EXCEPTION',
}

export enum PaymentBatchItemStatus {
  QUEUED = 'QUEUED',
  SUBMITTING = 'SUBMITTING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  CANCELLED = 'CANCELLED',
}

@Entity('payment_batch')
@Index('uq_payment_batch_no', ['batchNo'], { unique: true })
@Index('idx_payment_batch_scope_status', ['tenantId', 'merchantId', 'status', 'createdAt'])
export class PaymentBatchEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'varchar', length: 64, update: false }) batchNo: string
  @Column({ type: 'uuid', update: false }) paymentAccountId: string
  @Column({ type: 'uuid', update: false }) paymentAccountChannelId: string
  @Column({ type: 'uuid', nullable: true, update: false }) batchPolicyId: string | null
  @Column({ type: 'varchar', length: 16, update: false }) currency: string
  @Column({ type: 'integer' }) totalCount: number
  @Column({ type: 'decimal', precision: 20, scale: 2 }) totalAmount: string
  @Column({ type: 'integer', default: 0 }) successCount: number
  @Column({ type: 'integer', default: 0 }) failedCount: number
  @Column({ type: 'integer', default: 0 }) processingCount: number
  @Column({ type: 'integer', default: 0 }) unknownCount: number
  @Column({ type: 'varchar', length: 128, nullable: true }) upstreamId: string | null
  @Column({ type: 'enum', enum: PaymentBatchStatus, enumName: 'payment_batch_status_enum' })
  status: PaymentBatchStatus
  @Column({ type: 'varchar', length: 512, nullable: true }) lastError: string | null
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) triggerRuleIds: string[]
  @Column({ type: 'varchar', length: 32, default: 'MANUAL' }) triggerSource: string
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  telegramSubmissionMessages: Array<{ groupId: string; messageId: number }>
  @Column({ type: 'integer', default: 0 }) reconciliationAttempts: number
  @Column({ type: 'timestamptz', nullable: true }) nextReconcileAt: Date | null
  @VersionColumn() version: number
}

@Entity('payment_batch_item')
@Index('uq_payment_batch_item_order', ['batchId', 'paymentOrderId'], { unique: true })
@Index('idx_payment_batch_item_batch_status', ['batchId', 'status'])
@Index('uq_payment_batch_item_active_order', ['paymentOrderId'], {
  unique: true,
  where: `status IN ('QUEUED', 'SUBMITTING', 'PROCESSING', 'UNKNOWN')`,
})
export class PaymentBatchItemEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'uuid', update: false }) batchId: string
  @Column({ type: 'uuid', update: false }) paymentOrderId: string
  @Column({ type: 'decimal', precision: 20, scale: 2, update: false }) amount: string
  @Column({
    type: 'enum',
    enum: PaymentBatchItemStatus,
    enumName: 'payment_batch_item_status_enum',
  })
  status: PaymentBatchItemStatus
  @Column({ type: 'varchar', length: 128, nullable: true }) upstreamId: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) errorCode: string | null
  @Column({ type: 'varchar', length: 512, nullable: true }) errorMessage: string | null
  @VersionColumn() version: number
}

@Entity('payment_batch_status_history')
@Index('idx_payment_batch_status_history', ['tenantId', 'merchantId', 'batchId', 'createdAt'])
export class PaymentBatchStatusHistoryEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'uuid', update: false }) batchId: string
  @Column({
    type: 'enum',
    enum: PaymentBatchStatus,
    enumName: 'payment_batch_status_enum',
    nullable: true,
  })
  fromStatus: PaymentBatchStatus | null
  @Column({ type: 'enum', enum: PaymentBatchStatus, enumName: 'payment_batch_status_enum' })
  toStatus: PaymentBatchStatus
  @Column({ type: 'varchar', length: 64 }) source: string
  @Column({ type: 'varchar', length: 512, nullable: true }) reason: string | null
}
