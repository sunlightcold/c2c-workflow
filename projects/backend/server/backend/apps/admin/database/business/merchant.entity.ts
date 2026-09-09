import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus, MerchantPlatform } from './business.enums'

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

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}
