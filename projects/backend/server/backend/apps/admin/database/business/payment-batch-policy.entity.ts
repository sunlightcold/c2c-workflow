import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus, PaymentBatchPolicyScope, PaymentBatchRuleType } from './business.enums'

@Entity('payment_batch_policy')
@Index('uq_payment_batch_policy_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('idx_payment_batch_policy_scope', ['tenantId', 'merchantId', 'status'])
export class PaymentBatchPolicyEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({
    type: 'enum',
    enum: PaymentBatchPolicyScope,
    enumName: 'payment_batch_policy_scope_enum',
    update: false,
  })
  scopeType: PaymentBatchPolicyScope
  @Column({ type: 'uuid', nullable: true, update: false }) merchantId: string | null
  @Column({ type: 'varchar', length: 64, update: false }) code: string
  @Column({ type: 'varchar', length: 100 }) name: string
  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}

@Entity('payment_batch_policy_rule')
@Index('idx_payment_batch_policy_rule_scope', ['tenantId', 'policyId', 'status'])
export class PaymentBatchPolicyRuleEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) policyId: string
  @Column({ type: 'enum', enum: PaymentBatchRuleType, enumName: 'payment_batch_rule_type_enum' })
  ruleType: PaymentBatchRuleType
  @Column({ type: 'integer', nullable: true }) intervalSeconds: number | null
  @Column({ type: 'integer', nullable: true }) orderCount: number | null
  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}
