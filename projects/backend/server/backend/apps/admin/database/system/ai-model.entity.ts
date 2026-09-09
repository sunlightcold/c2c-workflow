import { AiAdapterCode, AiCapability } from '@/common/models'
import { CommonUuidEntity } from '@/common/entities'
import { Check, Column, Entity, Index } from 'typeorm'

export const SysAiModelTableName = 'sys_ai_model'

@Entity(SysAiModelTableName)
@Index('uq_sys_ai_model_code', ['code'], { unique: true })
@Check(
  'ck_sys_ai_model_adapter',
  `"adapterCode" IN ('gemini-generate-content', 'openai-chat-completions', 'openai-images', 'openai-responses')`,
)
@Check(
  'ck_sys_ai_model_capabilities',
  `jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) > 0`,
)
export class SysAiModelEntity extends CommonUuidEntity {
  @Column({ type: 'varchar', length: 120, update: false })
  code: string

  @Column({ type: 'varchar', length: 120 })
  name: string

  @Column({ type: 'varchar', length: 64 })
  adapterCode: AiAdapterCode

  @Column({ type: 'varchar', length: 160 })
  upstreamModel: string

  @Column({ type: 'jsonb' })
  capabilities: AiCapability[]

  @Column({ type: 'boolean', default: false })
  enabled: boolean
}
