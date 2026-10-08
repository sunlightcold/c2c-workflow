import { MerchantOrderStatus, MerchantPlatform } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { TenantContextDto } from '../business/business.dto'

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
const nonNegativeCnyAmountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/

export class MerchantOrderListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional({ enum: MerchantOrderStatus })
  @IsOptional()
  @IsEnum(MerchantOrderStatus)
  status?: MerchantOrderStatus

  @ApiPropertyOptional({ description: '平台订单号，支持模糊查询' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  platformOrderId?: string

  @ApiPropertyOptional({ enum: ['ALIPAY'] })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string

  @ApiPropertyOptional({ description: '平台订单开始时间，ISO 8601' })
  @IsOptional()
  @IsDateString()
  startTime?: string

  @ApiPropertyOptional({ description: '平台订单结束时间，ISO 8601' })
  @IsOptional()
  @IsDateString()
  endTime?: string

  @ApiPropertyOptional({ description: '订单金额下限（含）', example: '10.00' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(nonNegativeCnyAmountPattern)
  minAmount?: string

  @ApiPropertyOptional({ description: '订单金额上限（含）', example: '1000.00' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(nonNegativeCnyAmountPattern)
  maxAmount?: string

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize = 20
}

export class MerchantOrderStatisticsDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional({ description: '平台订单号，支持模糊查询' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  platformOrderId?: string

  @ApiPropertyOptional({ enum: ['ALIPAY'] })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string

  @ApiPropertyOptional({ description: '订单金额下限（含）', example: '10.00' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(nonNegativeCnyAmountPattern)
  minAmount?: string

  @ApiPropertyOptional({ description: '订单金额上限（含）', example: '1000.00' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(nonNegativeCnyAmountPattern)
  maxAmount?: string
}

export class MerchantOrderDetailDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string
}

export class MerchantOrderAppealSubmitDto extends MerchantOrderDetailDto {
  @ApiProperty({ description: '当前交易平台返回或定义的申诉原因码' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reasonCode: number
}

export class MerchantOrderUpstreamResponseDto {
  @ApiProperty({ enum: MerchantPlatform })
  platform: MerchantPlatform

  @ApiProperty({ description: '平台订单号，字符串' })
  platformOrderId: string

  @ApiProperty({ description: '实时查询完成时间，ISO 8601' })
  queriedAt: string

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '平台完整响应，认证字段除外',
  })
  raw: unknown

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: '现有订单解析器的实时结果；解析失败时为 null',
  })
  normalized: unknown

  @ApiProperty({ type: String, nullable: true, description: '解析失败原因，成功时为 null' })
  normalizationError: string | null
}
