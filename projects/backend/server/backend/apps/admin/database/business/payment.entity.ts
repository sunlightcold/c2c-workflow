import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus, PaymentAdapterCode, PaymentExecutionMode } from './business.enums'

@Entity('payment_platform')
@Index('uq_payment_platform_code', ['code'], { unique: true })
export class PaymentPlatformEntity extends CommonUuidEntity {
  @Column({ type: 'varchar', length: 32, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}

@Entity('payment_channel')
@Index('uq_payment_channel_platform_code', ['platformId', 'code'], { unique: true })
export class PaymentChannelEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  platformId: string

  @Column({ type: 'varchar', length: 64, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'enum', enum: PaymentExecutionMode, enumName: 'payment_execution_mode_enum' })
  executionMode: PaymentExecutionMode

  @Column({ type: 'enum', enum: PaymentAdapterCode, enumName: 'payment_adapter_code_enum' })
  adapterCode: PaymentAdapterCode

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}

@Entity('payment_account')
@Index('uq_payment_account_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('idx_payment_account_tenant', ['tenantId'])
export class PaymentAccountEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'uuid', update: false })
  platformId: string

  @Column({ type: 'varchar', length: 64, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 128 })
  externalAccountId: string

  @Column({ type: 'text', select: false })
  credentialRef: string

  @Column({ type: 'varchar', length: 8, nullable: true })
  credentialAuthMode: 'CERT' | 'KEY' | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  credentialAppId: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  credentialGateway: string | null

  @Column({ type: 'timestamptz', nullable: true })
  credentialUpdatedAt: Date | null

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}

@Entity('payment_account_channel')
@Index('uq_payment_account_channel', ['paymentAccountId', 'channelId'], { unique: true })
export class PaymentAccountChannelEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  paymentAccountId: string

  @Column({ type: 'uuid', update: false })
  channelId: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  configRef: string | null

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  minimumAmount: string | null

  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  maximumAmount: string | null

  @Column({ type: 'integer', default: 1 })
  concurrencyLimit: number

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}

@Entity('merchant_payment_plan')
@Index('idx_merchant_payment_plan_match', ['tenantId', 'merchantId', 'scene', 'currency', 'status'])
export class MerchantPaymentPlanEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'uuid', update: false })
  merchantId: string

  @Column({ type: 'varchar', length: 32 })
  scene: string

  @Column({ type: 'varchar', length: 16 })
  currency: string

  @Column({ type: 'uuid' })
  paymentAccountId: string

  @Column({ type: 'uuid' })
  paymentAccountChannelId: string

  @Column({ type: 'integer', default: 100 })
  priority: number

  @Column({ type: 'integer', default: 100 })
  weight: number

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}
