import { TimestampEntity } from '@/common/entities'
import { Column, Entity, PrimaryColumn } from 'typeorm'

export const SysClientErrorEventTableName = 'sys_client_error_event'

export enum ClientErrorLevel {
  ERROR = 'error',
  FATAL = 'fatal',
  WARNING = 'warning',
}

export enum ClientErrorPlatform {
  ANDROID = 'android',
  DESKTOP = 'desktop',
  IOS = 'ios',
  PWA = 'pwa',
  WEB = 'web',
}

export enum ClientErrorSource {
  CAUGHT = 'caught',
  GLOBAL = 'global',
  NETWORK = 'network',
  PROMISE = 'promise',
  REACT = 'react',
  RESOURCE = 'resource',
  WORKER = 'worker',
}

export interface ClientErrorBreadcrumb {
  category: string
  message: string
  timestamp: string
}

@Entity(SysClientErrorEventTableName)
export class SysClientErrorEventEntity extends TimestampEntity {
  @PrimaryColumn({ type: 'uuid' })
  eventId: string

  @Column({ type: 'varchar', length: 32 })
  appCode: string

  @Column({ type: 'varchar', length: 32 })
  environment: string

  @Column({ type: 'varchar', length: 100 })
  release: string

  @Column({ type: 'varchar', length: 16 })
  platform: ClientErrorPlatform

  @Column({ type: 'varchar', length: 16 })
  level: ClientErrorLevel

  @Column({ type: 'varchar', length: 16 })
  source: ClientErrorSource

  @Column({ type: 'varchar', length: 200, nullable: true })
  errorType?: string

  @Column({ type: 'text' })
  message: string

  @Column({ type: 'text', nullable: true })
  stack?: string

  @Column({ type: 'text', nullable: true })
  componentStack?: string

  @Column({ type: 'varchar', length: 1000, nullable: true })
  route?: string

  @Column({ type: 'varchar', length: 100, nullable: true })
  feature?: string

  @Column({ type: 'varchar', length: 20, nullable: true })
  locale?: string

  @Column({ type: 'uuid', nullable: true })
  sessionId?: string

  @Column({ type: 'varchar', length: 100, nullable: true })
  userRef?: string

  @Column({ type: 'varchar', length: 50 })
  ip: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  breadcrumbs: ClientErrorBreadcrumb[]

  @Column({ type: 'timestamptz' })
  occurredAt: Date
}
