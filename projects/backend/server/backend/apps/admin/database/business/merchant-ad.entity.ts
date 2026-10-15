import { CommonUuidEntity } from '@/common/entities'
import type {
  PriceEvidence,
  UnifiedAdRule,
} from '@/apps/admin/modules/c2c-ad/domain/ad-pricing.types'
import { Check, Column, Entity, Index } from 'typeorm'
import { MerchantPlatform } from './business.enums'

export type MerchantAdStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
export type MerchantAdRunTrigger = 'PREVIEW' | 'MANUAL' | 'AUTO'
export type MerchantAdRunStatus = 'READY' | 'HOLD' | 'BLOCKED' | 'PENDING' | 'APPLIED' | 'FAILED'

@Entity('merchant_ad')
@Check('ck_merchant_ad_buy_usdt', `side = 'BUY' AND asset = 'USDT'`)
@Check('ck_merchant_ad_status', `status IN ('ONLINE', 'OFFLINE', 'UNKNOWN')`)
@Check('ck_merchant_ad_price', 'price > 0')
@Check('ck_merchant_ad_rule_version', '"ruleVersion" >= 0')
@Index('uq_merchant_ad_scope_platform_ad', ['tenantId', 'merchantId', 'platformAdId'], {
  unique: true,
})
@Index('uq_merchant_ad_id_scope', ['id', 'tenantId', 'merchantId'], { unique: true })
@Index('idx_merchant_ad_scope', ['tenantId', 'merchantId', 'createdAt'])
@Index('idx_merchant_ad_due', ['nextRunAt'], { where: 'enabled = true' })
export class MerchantAdEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({
    type: 'enum',
    enum: MerchantPlatform,
    enumName: 'merchant_platform_enum',
    update: false,
  })
  platform: MerchantPlatform
  @Column({ type: 'varchar', length: 128 }) platformAdId: string
  @Column({ type: 'varchar', length: 16, update: false }) asset: string
  @Column({ type: 'varchar', length: 16, update: false }) fiatCurrency: string
  @Column({ type: 'varchar', length: 8, default: 'BUY', update: false }) side: 'BUY'
  @Column({ type: 'decimal', precision: 36, scale: 18 }) price: string
  @Column({ type: 'varchar', length: 16 }) status: MerchantAdStatus
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) paymentMethods: string[]
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  availableAmount: string | null
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  minFiatAmount: string | null
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  maxFiatAmount: string | null
  @Column({ type: 'jsonb', nullable: true }) rule: UnifiedAdRule | null
  @Column({ type: 'integer', default: 0 }) ruleVersion: number
  @Column({ type: 'boolean', default: false }) enabled: boolean
  @Column({ type: 'timestamptz', nullable: true }) nextRunAt: Date | null
  @Column({ type: 'timestamptz' }) lastSyncedAt: Date
  @Column({ type: 'varchar', length: 512, nullable: true }) lastError: string | null
  @Column({ type: 'uuid', nullable: true }) pendingRunId: string | null
}

@Entity('merchant_ad_run')
@Check('ck_merchant_ad_run_trigger', `trigger IN ('PREVIEW', 'MANUAL', 'AUTO')`)
@Check(
  'ck_merchant_ad_run_status',
  `status IN ('READY', 'HOLD', 'BLOCKED', 'PENDING', 'APPLIED', 'FAILED')`,
)
@Index('idx_merchant_ad_run_scope', ['tenantId', 'merchantId', 'adId', 'createdAt'])
@Index('idx_merchant_ad_run_pending', ['status', 'createdAt'], {
  where: "status = 'PENDING'",
})
export class MerchantAdRunEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'uuid', update: false }) adId: string
  @Column({ type: 'integer', update: false }) ruleVersion: number
  @Column({ type: 'jsonb', update: false }) rule: UnifiedAdRule
  @Column({ type: 'varchar', length: 16, update: false }) trigger: MerchantAdRunTrigger
  @Column({ type: 'varchar', length: 16 }) status: MerchantAdRunStatus
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  currentPrice: string | null
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  targetPrice: string | null
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  actualPrice: string | null
  @Column({ type: 'varchar', length: 128, update: false }) platformAdId: string
  @Column({ type: 'varchar', length: 128, nullable: true }) resultPlatformAdId: string | null
  @Column({ type: 'jsonb', nullable: true }) evidence: PriceEvidence | null
  @Column({ type: 'varchar', length: 512 }) reason: string
  @Column({ type: 'varchar', length: 128, nullable: true, update: false })
  createdBy: string | null
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null
}
