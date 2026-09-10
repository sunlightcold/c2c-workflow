import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus, MerchantPlatform } from './business.enums'

@Entity('merchant_platform_credential')
@Index('uq_merchant_platform_credential_version', ['merchantId', 'version'], { unique: true })
@Index('uq_merchant_platform_credential_active', ['merchantId'], {
  unique: true,
  where: `status = 'active'`,
})
@Index('idx_merchant_platform_credential_scope', ['tenantId', 'merchantId'])
export class MerchantPlatformCredentialEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false }) tenantId: string
  @Column({ type: 'uuid', update: false }) merchantId: string
  @Column({
    type: 'enum',
    enum: MerchantPlatform,
    enumName: 'merchant_platform_enum',
    update: false,
  })
  platform: MerchantPlatform
  @Column({ type: 'integer', update: false }) version: number
  @Column({ type: 'text', update: false, select: false }) credentialRef: string
  @Column({ type: 'varchar', length: 16 }) authMode: 'API_KEY' | 'WEB_COOKIE'
  @Column({ type: 'varchar', length: 255 }) apiBaseUrl: string
  @Column({ type: 'varchar', length: 32, nullable: true }) clientType: string | null
  @Column({ type: 'varchar', length: 64, nullable: true }) xUserId: string | null
  @Column({ type: 'integer', default: 5000 }) requestTimeoutMs: number
  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}
