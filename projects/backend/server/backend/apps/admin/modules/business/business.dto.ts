import { BusinessStatus, MerchantPlatform } from '@admin/database'
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
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

export class TenantContextDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string
}

export class CreateTenantDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string
}

export class SetTenantStatusDto {
  @ApiProperty({ enum: BusinessStatus })
  @IsEnum(BusinessStatus)
  status: BusinessStatus
}

export class CreateMerchantDto extends TenantContextDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: MerchantPlatform })
  @IsEnum(MerchantPlatform)
  platform: MerchantPlatform

  @ApiProperty({ description: '币安或欧易商家编号' })
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  externalMerchantId: string

  @ApiPropertyOptional({ description: '上游 API 地址；本地测试时填写 Mock 地址' })
  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(255)
  apiBaseUrl?: string

  @ApiPropertyOptional({ enum: ['API_KEY', 'WEB_COOKIE'] })
  @IsOptional()
  @IsIn(['API_KEY', 'WEB_COOKIE'])
  authMode?: 'API_KEY' | 'WEB_COOKIE'

  @ApiPropertyOptional({ description: '币安 API Key；创建币安账号时必填' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string

  @ApiPropertyOptional({ description: '币安 Secret Key；创建币安账号时必填' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secretKey?: string

  @ApiPropertyOptional({ description: '欧易网页 Cookie；创建欧易账号时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  sessionCookie?: string

  @ApiPropertyOptional({ description: '欧易 Authorization；创建欧易账号时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  authorization?: string

  @ApiPropertyOptional({ default: 'WEB' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientType?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  xUserId?: string

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number

  @ApiPropertyOptional({ default: 120, minimum: 0, maximum: 3600 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  overlapSeconds?: number

  @ApiPropertyOptional({ default: [1], type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  orderStatusList?: number[]

  @ApiPropertyOptional({ default: 15000, minimum: 1000, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  requestTimeoutMs?: number

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  paidConfirmIntervalMinMs?: number

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  paidConfirmIntervalMaxMs?: number

  @ApiPropertyOptional({ description: '支付机器人编码' })
  @Transform(upper)
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  botCode?: string

  @ApiPropertyOptional({ description: 'Telegram 群组 ID' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^-\d+$/)
  chatId?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  c2cChatOrderCreatedEnabled?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  c2cChatOrderCreatedMessage?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  c2cChatOrderPaidEnabled?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  c2cChatOrderPaidMessage?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  c2cChatOrderCompletedEnabled?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  c2cChatOrderCompletedMessage?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoAppealEnabled?: boolean

  @ApiPropertyOptional({ default: 18, minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  autoAppealDelayMinutes?: number

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}

export class UpdateMerchantDto extends PartialType(
  OmitType(CreateMerchantDto, [
    'platform',
    'authMode',
    'apiKey',
    'secretKey',
    'sessionCookie',
    'authorization',
  ] as const),
) {}

export class MerchantListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  accountCode?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalMerchantId?: string

  @ApiPropertyOptional({ enum: MerchantPlatform })
  @IsOptional()
  @IsEnum(MerchantPlatform)
  platform?: MerchantPlatform

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus

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

export class CreatePaymentAccountDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  platformId: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(128)
  externalAccountId: string

  @ApiProperty({ description: 'Secret Manager/KMS 凭据引用' })
  @Transform(trim)
  @Matches(/^[a-zA-Z][a-zA-Z0-9+._:/-]{7,254}$/)
  credentialRef: string
}

export class UpdatePaymentAccountDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ description: '支付宝商户号' })
  @Transform(trim)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(128)
  externalAccountId?: string

  @ApiPropertyOptional({ description: '新的 Secret Manager/KMS 凭据引用；不修改时不提交' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^[a-zA-Z][a-zA-Z0-9+._:/-]{7,254}$/)
  credentialRef?: string
}

export class PaymentAccountListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountCode?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalAccountId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  platformId?: string

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus

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

export class RotateMerchantPlatformCredentialDto extends TenantContextDto {
  @ApiPropertyOptional({ description: '币安 API Key' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string

  @ApiPropertyOptional({ description: '币安 Secret Key' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secretKey?: string

  @ApiPropertyOptional({ description: '欧易网页 Cookie' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  sessionCookie?: string

  @ApiPropertyOptional({ description: '欧易 Authorization' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  authorization?: string

  @ApiPropertyOptional({ description: '币安客户端类型' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientType?: string

  @ApiPropertyOptional({ description: '币安用户标识' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  xUserId?: string

  @ApiPropertyOptional({ default: 5000, minimum: 1000, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  requestTimeoutMs = 15000
}

export class OpenPaymentAccountChannelDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  channelId: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @Matches(/^[a-zA-Z][a-zA-Z0-9+._:/-]{7,254}$/)
  configRef?: string

  @ApiPropertyOptional({ example: '1.00' })
  @IsOptional()
  @Matches(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/)
  minimumAmount?: string

  @ApiPropertyOptional({ example: '50000.00' })
  @IsOptional()
  @Matches(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/)
  maximumAmount?: string

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  concurrencyLimit?: number
}

export class UpdatePaymentAccountChannelDto extends TenantContextDto {
  @ApiPropertyOptional({ description: '新的通道配置引用；不修改时不提交' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^[a-zA-Z][a-zA-Z0-9+._:/-]{7,254}$/)
  configRef?: string

  @ApiPropertyOptional({ example: '1.00', nullable: true })
  @IsOptional()
  @Matches(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/)
  minimumAmount?: string | null

  @ApiPropertyOptional({ example: '50000.00', nullable: true })
  @IsOptional()
  @Matches(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/)
  maximumAmount?: string | null

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  concurrencyLimit?: number
}

export class PaymentPlanListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string
}

export class CreatePaymentPlanDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string

  @ApiProperty()
  @IsUUID()
  paymentAccountId: string

  @ApiProperty()
  @IsUUID()
  paymentAccountChannelId: string

  @ApiProperty({ example: 'C2C_BUY' })
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  scene: string

  @ApiProperty({ example: 'CNY' })
  @Transform(upper)
  @Matches(/^[A-Z]{3,8}$/)
  currency: string

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  priority: number

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  weight: number
}

export class UpdatePaymentPlanDto extends TenantContextDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountChannelId?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number
}
