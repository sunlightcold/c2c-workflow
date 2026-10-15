import { MerchantPlatform } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { TenantContextDto } from '../business/business.dto'
import type { UnifiedAdRule } from './domain/ad-pricing.types'

const decimal = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/

export class UnifiedAdRuleDto implements UnifiedAdRule {
  @ApiPropertyOptional({ default: false })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  excludeInactive = false

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  linkedAdId: string | null = null

  @ApiPropertyOptional({ type: String, nullable: true, description: '折扣系数；0.01 表示 1%' })
  @ValidateIf((rule: UnifiedAdRuleDto) => Boolean(rule.linkedAdId))
  @Matches(decimal)
  linkedDiscount: string | null = null
  @ApiProperty({ enum: ['FIXED', 'DYNAMIC'] })
  @IsIn(['FIXED', 'DYNAMIC'])
  mode: 'FIXED' | 'DYNAMIC'

  @ApiProperty({ description: '加价格子，必须是 0.01 的正整数倍' })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @Matches(decimal)
  step: string

  @ApiProperty({ description: '法币金额；0 表示不限制查询金额' })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @Matches(decimal)
  competitorAmount: string

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  competitorPaymentMethods: string[]

  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  competitorPeriod: number | null = null

  @ApiProperty()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  merchantOnly: boolean

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  followNickname: string | null = null

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(128, { each: true })
  blockedNicknames: string[]

  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((rule: UnifiedAdRuleDto) => rule.mode === 'FIXED')
  @Matches(decimal)
  fixedLimit: string | null = null

  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((rule: UnifiedAdRuleDto) => rule.mode === 'DYNAMIC')
  @Matches(decimal)
  profitPerUsdt: string | null = null

  @ApiProperty({ type: String, nullable: true, description: '百分数：0.11 表示 0.11%' })
  @ValidateIf((rule: UnifiedAdRuleDto) => rule.mode === 'DYNAMIC')
  @Matches(decimal)
  feePercent: string | null = null

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  referencePaymentMethods: string[]

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  referencePosition: number

  @ApiProperty({ minimum: 15, maximum: 86400 })
  @IsInt()
  @Min(15)
  @Max(86400)
  intervalSeconds: number
}

export class AdScopeDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string
}

export class AdRuleDto extends AdScopeDto {
  @ApiProperty({ type: UnifiedAdRuleDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UnifiedAdRuleDto)
  rule: UnifiedAdRuleDto
}

export class AdListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional({ enum: MerchantPlatform })
  @IsOptional()
  @IsEnum(MerchantPlatform)
  platform?: MerchantPlatform

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}

export class AdRunListDto extends AdListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  adId?: string
}
