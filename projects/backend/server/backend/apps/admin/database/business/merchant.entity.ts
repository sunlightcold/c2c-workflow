import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus, MerchantPlatform, PaymentExecutionMode } from './business.enums'

@Entity('merchant')
@Index('uq_merchant_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('idx_merchant_tenant', ['tenantId'])
export class MerchantEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'varchar', length: 32, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({
    type: 'enum',
    enum: MerchantPlatform,
    enumName: 'merchant_platform_enum',
    update: false,
  })
  platform: MerchantPlatform

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalMerchantId: string | null

  @Column({ type: 'varchar', length: 255 })
  apiBaseUrl: string

  @Column({ type: 'integer', default: 20 })
  pageSize: number

  @Column({ type: 'integer', default: 120 })
  overlapSeconds: number

  @Column({ type: 'integer', array: true, default: () => 'ARRAY[1]::integer[]' })
  orderStatusList: number[]

  @Column({ type: 'integer', default: 15000 })
  requestTimeoutMs: number

  @Column({ type: 'integer', default: 0 })
  paidConfirmIntervalMinMs: number

  @Column({ type: 'integer', default: 0 })
  paidConfirmIntervalMaxMs: number

  @Column({ type: 'uuid', nullable: true })
  paidConfirmLockId: string | null

  @Column({ type: 'timestamptz', nullable: true })
  paidConfirmLockUntil: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  paidConfirmNextAt: Date | null

  @Column({ type: 'boolean', default: false })
  automaticPaymentEnabled: boolean

  @Column({
    type: 'enum',
    enum: PaymentExecutionMode,
    enumName: 'payment_execution_mode_enum',
    default: PaymentExecutionMode.INSTANT,
  })
  automaticPaymentExecutionMode: PaymentExecutionMode

  @Column({ type: 'varchar', length: 64, nullable: true })
  botCode: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  chatId: string | null

  @Column({ type: 'boolean', default: false })
  c2cChatOrderCreatedEnabled: boolean

  @Column({ type: 'varchar', length: 500, nullable: true })
  c2cChatOrderCreatedMessage: string | null

  @Column({ type: 'boolean', default: false })
  c2cChatOrderPaidEnabled: boolean

  @Column({ type: 'varchar', length: 500, nullable: true })
  c2cChatOrderPaidMessage: string | null

  @Column({ type: 'boolean', default: false })
  c2cChatOrderCompletedEnabled: boolean

  @Column({ type: 'timestamptz', nullable: true })
  c2cChatOrderCompletedEnabledAt: Date | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  c2cChatOrderCompletedMessage: string | null

  @Column({ type: 'boolean', default: false })
  autoAppealEnabled: boolean

  @Column({ type: 'timestamptz', nullable: true })
  autoAppealEnabledAt: Date | null

  @Column({ type: 'integer', default: 18 })
  autoAppealDelayMinutes: number

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}
