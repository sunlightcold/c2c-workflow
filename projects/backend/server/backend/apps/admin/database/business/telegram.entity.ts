import { CommonUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'
import { BusinessStatus } from './business.enums'
import { PaymentSourceType } from './payment-order.entity'

export enum TelegramGroupBindingState {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  UNBOUND = 'UNBOUND',
}

export enum TelegramBotType {
  HQ = 'HQ',
  MERCHANT = 'MERCHANT',
  PAYMENT = 'PAYMENT',
}

export enum TelegramSuperAdminScopeType {
  ALL_GROUPS = 'ALL_GROUPS',
  SPECIFIED_GROUPS = 'SPECIFIED_GROUPS',
}

@Entity('telegram_bot')
@Index('uq_telegram_bot_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('idx_telegram_bot_tenant', ['tenantId'])
export class TelegramBotEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'varchar', length: 64, update: false })
  code: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'enum', enum: TelegramBotType, enumName: 'telegram_bot_type_enum' })
  botType: TelegramBotType

  @Column({ type: 'varchar', length: 255, select: false })
  tokenRef: string

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  webhookSecretRef: string | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  webhookUrl: string | null

  @Column({ type: 'varchar', length: 16, default: 'zh-CN' })
  language: string

  @Column({ type: 'varchar', array: true })
  capabilities: string[]

  @Column({ type: 'boolean', default: true })
  paymentOrderRequireConfirmation: boolean

  @Column({ type: 'boolean', default: true })
  batchSubmitRequireConfirmation: boolean

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null
}

@Entity('telegram_group')
@Index('idx_telegram_group_tenant', ['tenantId'])
@Index('idx_telegram_group_bot', ['tenantId', 'botId'])
@Index('idx_telegram_group_merchant', ['tenantId', 'merchantId'])
export class TelegramGroupEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'uuid' })
  botId: string

  @Column({ type: 'uuid' })
  merchantId: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 32, nullable: true })
  chatId: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  chatType: string | null

  @Column({ type: 'enum', enum: PaymentSourceType, enumName: 'payment_source_type_enum' })
  paymentScene: PaymentSourceType

  @Column({ type: 'varchar', array: true })
  capabilities: string[]

  @Column({ type: 'varchar', array: true, default: () => 'ARRAY[]::varchar[]' })
  notificationEvents: string[]

  @Column({ type: 'boolean', default: true })
  notificationsEnabled: boolean

  @Column({
    type: 'enum',
    enum: TelegramGroupBindingState,
    enumName: 'telegram_group_binding_state_enum',
  })
  bindingState: TelegramGroupBindingState

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  verificationCodeHash: string | null

  @Column({ type: 'timestamptz', nullable: true, select: false })
  verificationExpiresAt: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null
}

@Entity('telegram_group_member')
@Index('uq_telegram_group_member_tg', ['groupId', 'telegramUserId'], { unique: true })
@Index('uq_telegram_group_member_user', ['groupId', 'userId'], { unique: true })
@Index('idx_telegram_group_member_tenant', ['tenantId'])
export class TelegramGroupMemberEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'uuid', update: false })
  groupId: string

  @Column({ type: 'integer', update: false })
  userId: number

  @Column({ type: 'varchar', length: 32 })
  telegramUserId: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  telegramUsername: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  displayName: string | null

  @Column({ type: 'varchar', length: 16 })
  role: string

  @Column({ type: 'varchar', array: true })
  capabilities: string[]

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}

@Entity('telegram_super_admin')
@Index('uq_telegram_super_admin_tenant_tg', ['tenantId', 'telegramUserId'], { unique: true })
@Index('uq_telegram_super_admin_tenant_user', ['tenantId', 'userId'], { unique: true })
export class TelegramSuperAdminEntity extends CommonUuidEntity {
  @Column({ type: 'uuid', update: false })
  tenantId: string

  @Column({ type: 'integer', update: false })
  userId: number

  @Column({ type: 'varchar', length: 32 })
  telegramUserId: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  telegramUsername: string | null

  @Column({
    type: 'enum',
    enum: TelegramSuperAdminScopeType,
    enumName: 'telegram_super_admin_scope_type_enum',
  })
  scopeType: TelegramSuperAdminScopeType

  @Column({ type: 'uuid', array: true, default: () => 'ARRAY[]::uuid[]' })
  groupIds: string[]

  @Column({ type: 'enum', enum: BusinessStatus, enumName: 'business_status_enum' })
  status: BusinessStatus
}
