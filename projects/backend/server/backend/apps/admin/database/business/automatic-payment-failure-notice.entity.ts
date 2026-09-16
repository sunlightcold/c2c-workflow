import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

@Entity('automatic_payment_failure_notice')
@Index(
  'uq_automatic_payment_failure_notice_scope',
  ['tenantId', 'merchantId', 'code', 'referenceId'],
  { unique: true },
)
export class AutomaticPaymentFailureNoticeEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({ type: 'varchar', length: 64, update: false }) code: string
  @Column({ type: 'varchar', length: 160, update: false }) referenceId: string
  @Column({ type: 'varchar', length: 512, update: false }) message: string
}
