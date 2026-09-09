import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus, TenantType } from './business.enums'

export const HeadquartersSelfTenantId = '00000000-0000-4000-8000-000000000001'

@Entity('tenant')
@Index('uq_tenant_code', ['code'], { unique: true })
export class TenantEntity extends CommonUuidEntity {
  @Column({ type: 'enum', enum: TenantType, enumName: 'tenant_type_enum' })
  type: TenantType

  @Column({ type: 'varchar', length: 32, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus

  @Column({ type: 'varchar', length: 64, default: 'Asia/Shanghai' })
  timezone: string

  @Column({ type: 'boolean', default: false, update: false })
  systemLocked: boolean
}
