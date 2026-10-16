import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

export const PROXY_PROTOCOLS = ['http', 'https', 'socks5', 'socks5h'] as const
export type ProxyProtocol = (typeof PROXY_PROTOCOLS)[number]

@Entity('ip_proxy')
@Index('uq_ip_proxy_scope_fingerprint', ['tenantId', 'fingerprint'], { unique: true })
export class IpProxyEntity extends CommonUuidEntity {
  @Column('uuid') tenantId: string
  @Column({ length: 100 }) name: string
  @Column({ type: 'varchar', length: 16 }) protocol: ProxyProtocol
  @Column({ length: 255 }) host: string
  @Column('integer') port: number
  @Column({ length: 255, default: '' }) username: string
  @Column({ type: 'text', select: false }) passwordRef: string
  @Column({ default: false }) passwordConfigured: boolean
  @Column({ length: 64, select: false }) fingerprint: string
  @Column({ length: 64, select: false }) batchFingerprint: string
  @Column({ type: 'varchar', length: 16, default: 'active' }) status: 'active' | 'inactive'
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null
  @Column({ type: 'integer', default: 7 }) expiryWarnDays: number
  @Column({ type: 'varchar', length: 16, default: 'none' }) fallbackMode:
    | 'none'
    | 'proxy'
    | 'direct'
  @Column({ type: 'uuid', nullable: true }) backupProxyId: string | null
  @Column({ type: 'jsonb', nullable: true }) lastTest: Record<string, unknown> | null
  @Column({ type: 'jsonb', nullable: true }) lastQuality: Record<string, unknown> | null
}
