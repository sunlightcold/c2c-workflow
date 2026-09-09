import { AiAdapterCode } from '@/common/models'
import { CommonUuidEntity } from '@/common/entities'
import { Check, Column, Entity, Index } from 'typeorm'

export const SysAiChannelTableName = 'sys_ai_channel'

export enum SysAiChannelStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  ERROR = 'error',
}

@Entity(SysAiChannelTableName)
@Index('uq_sys_ai_channel_code', ['code'], { unique: true })
@Check(
  'ck_sys_ai_channel_adapter',
  `"adapterCode" IN ('gemini-generate-content', 'openai-chat-completions', 'openai-images', 'openai-responses')`,
)
@Check('ck_sys_ai_channel_status', `status IN ('active', 'disabled', 'error')`)
@Check('ck_sys_ai_channel_max_concurrency', `"maxConcurrency" BETWEEN 1 AND 100`)
@Check('ck_sys_ai_channel_max_queued_requests', `"maxQueuedRequests" BETWEEN 1 AND 100000`)
export class SysAiChannelEntity extends CommonUuidEntity {
  @Column({ type: 'varchar', length: 64, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 100 })
  supplier: string

  @Column({ type: 'varchar', length: 64 })
  adapterCode: AiAdapterCode

  @Column({ type: 'varchar', length: 512 })
  baseUrl: string

  @Column({ type: 'text' })
  encryptedApiKey: string

  @Column({ type: 'integer', default: 1 })
  credentialVersion: number

  @Column({ type: 'varchar', length: 16, default: SysAiChannelStatus.DISABLED })
  status: SysAiChannelStatus

  @Column({ type: 'integer', default: 60_000 })
  timeoutMs: number

  @Column({ type: 'integer', default: 1 })
  maxConcurrency: number

  @Column({ type: 'integer', default: 20 })
  maxQueuedRequests: number

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt?: Date | null

  @Column({ type: 'varchar', length: 512, nullable: true })
  lastCheckMessage?: string | null
}
