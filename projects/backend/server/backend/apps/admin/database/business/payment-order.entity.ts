import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index, VersionColumn } from 'typeorm'

export enum PaymentSourceType {
  C2C_BUY = 'C2C_BUY',
  BOT_MANUAL = 'BOT_MANUAL',
  REFUND = 'REFUND',
}

export enum PaymentOrderStatus {
  CREATED = 'CREATED',
  READY = 'READY',
  SUBMITTING = 'SUBMITTING',
  PROCESSING = 'PROCESSING',
  UNKNOWN = 'UNKNOWN',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PLATFORM_CONFIRM_PENDING = 'PLATFORM_CONFIRM_PENDING',
  COMPLETED = 'COMPLETED',
  FUND_EXCEPTION = 'FUND_EXCEPTION',
}

@Entity('payment_order')
@Index('uq_payment_order_source', ['tenantId', 'merchantId', 'sourceType', 'sourceBusinessNo'], {
  unique: true,
})
@Index('uq_payment_order_no', ['paymentNo'], { unique: true })
export class PaymentOrderEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({
    type: 'enum',
    enum: PaymentSourceType,
    enumName: 'payment_source_type_enum',
    update: false,
  })
  sourceType: PaymentSourceType
  @Column({ type: 'varchar', length: 128, update: false }) sourceBusinessNo: string
  @Column({ type: 'varchar', length: 64, update: false }) paymentNo: string
  @Column({ type: 'decimal', precision: 20, scale: 2, update: false }) amount: string
  @Column({ type: 'varchar', length: 16, update: false }) currency: string
  @Column({ type: 'varchar', length: 255, update: false }) payeeIdentity: string
  @Column({ type: 'varchar', length: 128, update: false }) payeeName: string
  @Column({ type: 'uuid', update: false }) paymentPlanId: string
  @Column({ type: 'uuid', update: false }) paymentAccountId: string
  @Column({ type: 'uuid', update: false }) paymentAccountChannelId: string
  @Column({ type: 'enum', enum: PaymentOrderStatus, enumName: 'payment_order_status_enum' })
  status: PaymentOrderStatus
  @Column({ type: 'varchar', length: 128, nullable: true }) upstreamId: string | null
  @Column({ type: 'varchar', length: 512, nullable: true }) lastError: string | null
  @VersionColumn() version: number
}

@Entity('payment_attempt')
@Index('uq_payment_attempt_idempotency', ['idempotencyKey'], { unique: true })
export class PaymentAttemptEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'uuid', update: false }) paymentOrderId: string
  @Column({ type: 'varchar', length: 160, update: false }) idempotencyKey: string
  @Column({ type: 'varchar', length: 64 }) operation: string
  @Column({ type: 'enum', enum: PaymentOrderStatus, enumName: 'payment_order_status_enum' })
  resultStatus: PaymentOrderStatus
  @Column({ type: 'varchar', length: 128, nullable: true }) upstreamId: string | null
  @Column({ type: 'varchar', length: 512, nullable: true }) errorMessage: string | null
}

@Entity('payment_order_status_history')
@Index('idx_payment_order_history', ['paymentOrderId', 'createdAt'])
export class PaymentOrderStatusHistoryEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'uuid', update: false }) paymentOrderId: string
  @Column({ type: 'enum', enum: PaymentOrderStatus, enumName: 'payment_order_status_enum' })
  fromStatus: PaymentOrderStatus
  @Column({ type: 'enum', enum: PaymentOrderStatus, enumName: 'payment_order_status_enum' })
  toStatus: PaymentOrderStatus
  @Column({ type: 'varchar', length: 64 }) source: string
  @Column({ type: 'varchar', length: 512, nullable: true }) reason: string | null
}
