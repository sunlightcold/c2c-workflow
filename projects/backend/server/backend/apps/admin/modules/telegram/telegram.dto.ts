import {
  BusinessStatus,
  PaymentSourceType,
  TelegramGroupBindingState,
  TelegramSuperAdminScopeType,
} from '@admin/database'
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { TelegramBotType, TelegramCapability, TelegramGroupRole } from './telegram-policy'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

export class TelegramTenantContextDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string
}

export class TelegramEligibleUserDto {
  @ApiProperty()
  id: number

  @ApiProperty()
  username: string

  @ApiProperty()
  nickname: string
}

export class TelegramBotRuntimeStatusDto {
  @ApiProperty({ enum: ['ONLINE', 'CONNECTING', 'NOT_STARTED', 'DISABLED', 'ERROR'] })
  state: 'ONLINE' | 'CONNECTING' | 'NOT_STARTED' | 'DISABLED' | 'ERROR'

  @ApiProperty()
  runtimeRunning: boolean

  @ApiProperty({ format: 'date-time' })
  checkedAt: string

  @ApiProperty()
  message: string

  @ApiPropertyOptional()
  telegramId?: number

  @ApiPropertyOptional()
  telegramUsername?: string

  @ApiPropertyOptional({ format: 'date-time' })
  lastUpdateAt?: string
}

export class TelegramPageDto extends TelegramTenantContextDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}

export class CreateTelegramBotDto extends TelegramTenantContextDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: TelegramBotType })
  @IsEnum(TelegramBotType)
  botType: TelegramBotType

  @ApiProperty({ description: 'Telegram Bot Token，例如 123456789:AA...' })
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^\d{5,20}:[A-Za-z0-9_-]{10,}$/, {
    message: 'Telegram Bot Token 格式无效',
  })
  token: string

  @ApiPropertyOptional({ default: 'zh-CN' })
  @Transform(trim)
  @IsOptional()
  @IsIn(['zh-CN'])
  language?: string

  @ApiProperty({ enum: TelegramCapability, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(TelegramCapability, { each: true })
  capabilities: TelegramCapability[]

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  paymentOrderRequireConfirmation?: boolean

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  batchSubmitRequireConfirmation?: boolean

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}

export class UpdateTelegramBotDto extends PartialType(CreateTelegramBotDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus
}

export class TelegramBotListDto extends TelegramPageDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional()
  @Transform(upper)
  @IsOptional()
  @MaxLength(64)
  code?: string

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus
}

export class CreateTelegramGroupDto extends TelegramTenantContextDto {
  @ApiProperty()
  @IsUUID()
  botId: string

  @ApiProperty()
  @IsUUID()
  merchantId: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: [PaymentSourceType.BOT_MANUAL, PaymentSourceType.C2C_BUY] })
  @IsIn([PaymentSourceType.BOT_MANUAL, PaymentSourceType.C2C_BUY])
  paymentScene: PaymentSourceType

  @ApiProperty({ enum: TelegramCapability, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(TelegramCapability, { each: true })
  capabilities: TelegramCapability[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  notificationEvents?: string[]

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}

export class UpdateTelegramGroupDto extends PartialType(CreateTelegramGroupDto) {}

export class TelegramGroupListDto extends TelegramPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  botId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ enum: TelegramGroupBindingState })
  @IsOptional()
  @IsEnum(TelegramGroupBindingState)
  bindingState?: TelegramGroupBindingState
}

export class ApproveTelegramGroupDto extends TelegramTenantContextDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(/^-[0-9]{5,31}$/)
  chatId: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  chatName?: string

  @ApiPropertyOptional({ enum: ['group', 'supergroup'] })
  @IsOptional()
  @IsIn(['group', 'supergroup'])
  chatType?: string
}

export class CreateTelegramMemberDto extends TelegramTenantContextDto {
  @ApiProperty()
  @IsUUID()
  groupId: string

  @ApiProperty()
  @IsInt()
  @Min(1)
  userId: number

  @ApiProperty()
  @Matches(/^[0-9]{1,32}$/)
  telegramUserId: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramUsername?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string

  @ApiProperty({ enum: TelegramGroupRole })
  @IsEnum(TelegramGroupRole)
  role: TelegramGroupRole

  @ApiProperty({ enum: TelegramCapability, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(TelegramCapability, { each: true })
  capabilities: TelegramCapability[]
}

export class UpdateTelegramMemberDto extends PartialType(
  OmitType(CreateTelegramMemberDto, ['groupId', 'userId'] as const),
) {}

export class TelegramMemberListDto extends TelegramPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @Matches(/^[0-9]{1,32}$/)
  telegramUserId?: string

  @ApiPropertyOptional({ enum: TelegramGroupRole })
  @IsOptional()
  @IsEnum(TelegramGroupRole)
  role?: TelegramGroupRole

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus
}

export class CreateTelegramSuperAdminDto extends TelegramTenantContextDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  userId: number

  @ApiProperty()
  @Matches(/^[0-9]{1,32}$/)
  telegramUserId: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramUsername?: string

  @ApiProperty({ enum: TelegramSuperAdminScopeType })
  @IsEnum(TelegramSuperAdminScopeType)
  scopeType: TelegramSuperAdminScopeType

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  groupIds: string[]
}

export class UpdateTelegramSuperAdminDto extends PartialType(
  OmitType(CreateTelegramSuperAdminDto, ['userId'] as const),
) {}

export class TelegramSuperAdminListDto extends TelegramPageDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @Matches(/^[0-9]{1,32}$/)
  telegramUserId?: string

  @ApiPropertyOptional({ enum: TelegramSuperAdminScopeType })
  @IsOptional()
  @IsEnum(TelegramSuperAdminScopeType)
  scopeType?: TelegramSuperAdminScopeType

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus
}

export class SetTelegramStatusDto {
  @ApiProperty({ enum: BusinessStatus })
  @IsEnum(BusinessStatus)
  status: BusinessStatus
}
