import { AiCapability } from '@/common/models'
import { CommonUuidEntity } from '@/common/entities'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm'
import { SysAiChannelEntity } from './ai-channel.entity'
import { SysAiModelEntity } from './ai-model.entity'

export const SysAiFeatureRouteTableName = 'sys_ai_feature_route'

@Entity(SysAiFeatureRouteTableName)
@Index('uq_sys_ai_feature_route_priority', ['featureCode', 'priority'], { unique: true })
@Index('uq_sys_ai_feature_route_target', ['featureCode', 'modelId', 'channelId'], {
  unique: true,
})
@Check(
  'ck_sys_ai_feature_route_capability',
  `capability IN ('image_generation', 'text_completion', 'vision_understanding')`,
)
export class SysAiFeatureRouteEntity extends CommonUuidEntity {
  @Column({ type: 'varchar', length: 120 })
  featureCode: string

  @Column({ type: 'varchar', length: 40 })
  capability: AiCapability

  @Column({ type: 'uuid' })
  modelId: string

  @Column({ type: 'uuid' })
  channelId: string

  @Column({ type: 'integer' })
  priority: number

  @Column({ type: 'boolean', default: true })
  enabled: boolean

  @ManyToOne(() => SysAiModelEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'modelId' })
  model?: Relation<SysAiModelEntity>

  @ManyToOne(() => SysAiChannelEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channelId' })
  channel?: Relation<SysAiChannelEntity>
}
