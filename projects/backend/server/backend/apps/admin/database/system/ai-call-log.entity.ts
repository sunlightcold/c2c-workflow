import { AiAdapterCode, AiCapability } from '@/common/models'
import { CommonUuidEntity } from '@/common/entities'
import { Check, Column, Entity, Index } from 'typeorm'
import { AiCallLogStatus } from '@admin/modules/system/ai/ai.types'

export const SysAiCallLogTableName = 'sys_ai_call_log'

@Entity(SysAiCallLogTableName)
@Index('idx_sys_ai_call_log_started_at', ['startedAt'])
@Index('idx_sys_ai_call_log_feature_capability', ['featureCode', 'capability'])
@Index('idx_sys_ai_call_log_status', ['status'])
@Check(
  'ck_sys_ai_call_log_capability',
  `capability IN ('image_generation', 'text_completion', 'vision_understanding')`,
)
@Check('ck_sys_ai_call_log_status', `status IN ('success', 'failed')`)
export class SysAiCallLogEntity extends CommonUuidEntity {
  @Column({ type: 'varchar', length: 120 })
  featureCode: string

  @Column({ type: 'varchar', length: 40 })
  capability: AiCapability

  @Column({ type: 'varchar', length: 64 })
  adapterCode: AiAdapterCode

  @Column({ type: 'varchar', length: 64 })
  channelCode: string

  @Column({ type: 'varchar', length: 120 })
  modelCode: string

  @Column({ type: 'varchar', length: 16 })
  status: AiCallLogStatus

  @Column({ type: 'integer' })
  attempt: number

  @Column({ type: 'integer' })
  durationMs: number

  @Column({ type: 'timestamptz' })
  startedAt: Date

  @Column({ type: 'timestamptz' })
  endedAt: Date

  @Column({ type: 'integer', nullable: true })
  inputTokens?: number | null

  @Column({ type: 'integer', nullable: true })
  outputTokens?: number | null

  @Column({ type: 'integer', nullable: true })
  totalTokens?: number | null

  @Column({ type: 'varchar', length: 200, nullable: true })
  errorType?: string | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  requestId?: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  userId?: string | null
}
