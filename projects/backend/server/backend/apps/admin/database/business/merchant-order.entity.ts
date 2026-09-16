import { CommonUuidEntity } from '@/common/entities'
import { Check, Column, Entity, Index, VersionColumn } from 'typeorm'
import { MerchantOrderSide, MerchantOrderStatus, MerchantPlatform } from './business.enums'

export enum MerchantOrderAppealStatus {
  PROCESSING = 'PROCESSING',
  SUBMITTED = 'SUBMITTED',
}

export enum MerchantOrderAutoAppealStatus {
  RETRY = 'RETRY',
  SUBMITTED = 'SUBMITTED',
  SKIPPED = 'SKIPPED',
  MANUAL_REQUIRED = 'MANUAL_REQUIRED',
}

export enum MerchantOrderCompletionReplyStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

@Entity('merchant_order')
@Check('ck_merchant_order_buy_only_v1', `"side" = 'BUY'`)
@Index('uq_merchant_order_platform_order', ['merchantId', 'platform', 'platformOrderId'], {
  unique: true,
})
@Index('idx_merchant_order_scope_status', ['tenantId', 'merchantId', 'status', 'platformCreatedAt'])
export class MerchantOrderEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({
    type: 'enum',
    enum: MerchantPlatform,
    enumName: 'merchant_platform_enum',
    update: false,
  })
  platform: MerchantPlatform
  @Column({ type: 'varchar', length: 128, update: false }) platformOrderId: string
  @Column({ type: 'enum', enum: MerchantOrderSide, enumName: 'merchant_order_side_enum' })
  side: MerchantOrderSide
  @Column({ type: 'varchar', length: 64 }) platformStatus: string
  @Column({ type: 'enum', enum: MerchantOrderStatus, enumName: 'merchant_order_status_enum' })
  status: MerchantOrderStatus
  @Column({ type: 'varchar', length: 16 }) asset: string
  @Column({ type: 'decimal', precision: 36, scale: 18 }) assetAmount: string
  @Column({ type: 'varchar', length: 16 }) fiatCurrency: string
  @Column({ type: 'decimal', precision: 20, scale: 2 }) fiatAmount: string
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true }) unitPrice: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) counterpartyName: string | null
  @Column({ type: 'varchar', length: 32, nullable: true }) paymentMethod: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) platformPaymentMethodId: string | null
  @Column({ type: 'varchar', length: 255, nullable: true }) payeeIdentity: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) payeeName: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) identityName: string | null
  @Column({ type: 'varchar', length: 32, nullable: true }) kycStatus: string | null
  @Column({ type: 'boolean', default: false }) identityMatched: boolean
  @Column({ type: 'boolean', default: false }) payable: boolean
  @Column({ type: 'timestamptz', nullable: true }) paymentDeadline: Date | null
  @Column({ type: 'timestamptz' }) platformCreatedAt: Date
  @Column({ type: 'timestamptz', nullable: true }) platformUpdatedAt: Date | null
  @Column({ type: 'timestamptz' }) lastSyncedAt: Date
  @Column({ type: 'varchar', length: 512, nullable: true }) lastError: string | null
  @Column({
    type: 'enum',
    enum: MerchantOrderAppealStatus,
    enumName: 'merchant_order_appeal_status_enum',
    nullable: true,
  })
  appealStatus: MerchantOrderAppealStatus | null
  @Column({ type: 'integer', nullable: true }) appealReasonCode: number | null
  @Column({ type: 'varchar', length: 255, nullable: true }) appealReason: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) appealComplaintNo: string | null
  @Column({ type: 'timestamptz', nullable: true }) appealClaimedAt: Date | null
  @Column({ type: 'timestamptz', nullable: true }) appealSubmittedAt: Date | null
  @Column({ type: 'varchar', length: 512, nullable: true }) appealLastError: string | null
  @Column({ type: 'varchar', length: 32, nullable: true })
  autoAppealStatus: MerchantOrderAutoAppealStatus | null
  @Column({ type: 'integer', default: 0 }) autoAppealAttempts: number
  @Column({ type: 'timestamptz', nullable: true }) autoAppealNextAttemptAt: Date | null
  @Column({ type: 'timestamptz', nullable: true }) autoAppealProcessedAt: Date | null
  @Column({ type: 'varchar', length: 512, nullable: true }) autoAppealLastError: string | null
  @Column({ type: 'varchar', length: 32, nullable: true })
  completionReplyStatus: MerchantOrderCompletionReplyStatus | null
  @Column({ type: 'timestamptz', nullable: true }) completionReplyClaimedAt: Date | null
  @Column({ type: 'timestamptz', nullable: true }) completionReplySentAt: Date | null
  @Column({ type: 'timestamptz', nullable: true }) completionReplyNextRetryAt: Date | null
  @Column({ type: 'integer', default: 0 }) completionReplyAttempts: number
  @Column({ type: 'varchar', length: 512, nullable: true }) completionReplyLastError: string | null
  @VersionColumn() version: number
}

@Entity('merchant_order_status_history')
@Index('idx_merchant_order_status_history', [
  'tenantId',
  'merchantId',
  'merchantOrderId',
  'createdAt',
])
export class MerchantOrderStatusHistoryEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'uuid', update: false }) merchantOrderId: string
  @Column({
    type: 'enum',
    enum: MerchantOrderStatus,
    enumName: 'merchant_order_status_enum',
    nullable: true,
  })
  fromStatus: MerchantOrderStatus | null
  @Column({ type: 'enum', enum: MerchantOrderStatus, enumName: 'merchant_order_status_enum' })
  toStatus: MerchantOrderStatus
  @Column({ type: 'varchar', length: 64 }) source: string
  @Column({ type: 'varchar', length: 64 }) platformStatus: string
  @Column({ type: 'varchar', length: 512, nullable: true }) reason: string | null
}

@Entity('merchant_order_sync_checkpoint')
@Index('uq_merchant_order_sync_checkpoint', ['tenantId', 'merchantId'], { unique: true })
@Index('idx_merchant_order_sync_due', ['nextSyncAt'])
export class MerchantOrderSyncCheckpointEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'varchar', length: 255, nullable: true }) cursor: string | null
  @Column({ type: 'timestamptz', nullable: true }) windowEndAt: Date | null
  @Column({ type: 'timestamptz', nullable: true }) lastAttemptAt: Date | null
  @Column({ type: 'timestamptz', nullable: true }) lastSuccessAt: Date | null
  @Column({ type: 'timestamptz' }) nextSyncAt: Date
  @Column({ type: 'integer', default: 0 }) consecutiveFailures: number
  @Column({ type: 'varchar', length: 512, nullable: true }) lastError: string | null
  @Column({ type: 'varchar', length: 128, nullable: true }) leaseOwner: string | null
  @Column({ type: 'timestamptz', nullable: true }) leaseExpiresAt: Date | null
  @VersionColumn() version: number
}
