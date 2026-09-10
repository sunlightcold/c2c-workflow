import { BusinessStatus, MerchantPlatform } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsEnum,
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
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_-]{1,31}$/)
  code: string

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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z][a-z0-9-]{1,31}$/)
  code: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: MerchantPlatform })
  @IsEnum(MerchantPlatform)
  platform: MerchantPlatform

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalMerchantId?: string
}

export class CreatePaymentAccountDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  platformId: string

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z][a-z0-9-]{1,63}$/)
  code: string

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

export class RotateMerchantPlatformCredentialDto extends TenantContextDto {
  @ApiProperty({ description: 'Secret Manager/KMS 凭据引用' })
  @Transform(trim)
  @Matches(/^[a-zA-Z][a-zA-Z0-9+._:/-]{7,254}$/)
  credentialRef: string

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
  requestTimeoutMs = 5000
}

export class OpenPaymentAccountChannelDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  channelId: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  configRef?: string
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
