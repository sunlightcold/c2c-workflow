import { BusinessStatus, PaymentBatchPolicyScope, PaymentBatchRuleType } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { PaymentTenantContextDto } from './payment-order.dto'

export class PaymentBatchPolicyRuleDto {
  @ApiProperty({ enum: PaymentBatchRuleType })
  @IsEnum(PaymentBatchRuleType)
  ruleType: PaymentBatchRuleType

  @ApiPropertyOptional({ minimum: 10, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(86400)
  intervalSeconds?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  orderCount?: number

  @ApiProperty({ enum: BusinessStatus, default: BusinessStatus.ACTIVE })
  @IsEnum(BusinessStatus)
  status: BusinessStatus
}

export class CreatePaymentBatchPolicyDto extends PaymentTenantContextDto {
  @ApiProperty({ enum: PaymentBatchPolicyScope })
  @IsEnum(PaymentBatchPolicyScope)
  scopeType: PaymentBatchPolicyScope

  @ApiPropertyOptional({ format: 'uuid', description: '商家策略必填；全局策略不传' })
  @ValidateIf(
    (dto: CreatePaymentBatchPolicyDto) => dto.scopeType === PaymentBatchPolicyScope.MERCHANT,
  )
  @IsUUID()
  merchantId?: string

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ type: [PaymentBatchPolicyRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PaymentBatchPolicyRuleDto)
  rules: PaymentBatchPolicyRuleDto[]
}

export class UpdatePaymentBatchPolicyDto extends PaymentTenantContextDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ type: [PaymentBatchPolicyRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PaymentBatchPolicyRuleDto)
  rules: PaymentBatchPolicyRuleDto[]
}

export class PaymentBatchPolicyListDto extends PaymentTenantContextDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional({
    format: 'uuid',
    description: '查询指定商家可用的全局策略与商家策略',
  })
  @IsOptional()
  @IsUUID()
  applicableMerchantId?: string

  @ApiPropertyOptional({ enum: PaymentBatchPolicyScope })
  @IsOptional()
  @IsEnum(PaymentBatchPolicyScope)
  scopeType?: PaymentBatchPolicyScope

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}

export class SetPaymentBatchPolicyStatusDto extends PaymentTenantContextDto {
  @ApiProperty({ enum: BusinessStatus })
  @IsEnum(BusinessStatus)
  status: BusinessStatus
}
