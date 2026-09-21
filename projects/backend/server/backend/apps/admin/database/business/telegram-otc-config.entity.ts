import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

@Entity('telegram_otc_config')
@Index('uq_telegram_otc_config_scope', ['tenantId', 'botId', 'chatId'], { unique: true })
@Index('idx_telegram_otc_config_tenant', ['tenantId'])
export class TelegramOtcConfigEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'uuid', update: false })
  botId: string

  @Column({ type: 'varchar', length: 32, update: false })
  chatId: string

  @Column({ type: 'varchar', length: 16, default: 'OKX_BLOCK' })
  rateSource: string

  @Column({ type: 'varchar', length: 16, default: 'ALL' })
  paymentMethod: string

  @Column({ type: 'smallint', default: 3 })
  priceRank: number

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  rateAdjustment: string
}
