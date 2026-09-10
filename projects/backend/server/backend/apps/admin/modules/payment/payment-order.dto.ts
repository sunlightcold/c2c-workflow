import { PaymentExecutionMode, PaymentOrderStatus, PaymentSourceType } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { Type } from 'class-transformer'
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

export class PaymentTenantContextDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string
}

export class PaymentOrderListDto extends PaymentTenantContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional({ enum: PaymentExecutionMode })
  @IsOptional()
  @IsEnum(PaymentExecutionMode)
  executionMode?: PaymentExecutionMode

  @ApiPropertyOptional({ enum: PaymentSourceType })
  @IsOptional()
  @IsEnum(PaymentSourceType)
  sourceType?: PaymentSourceType

  @ApiPropertyOptional({ enum: PaymentOrderStatus })
  @IsOptional()
  @IsEnum(PaymentOrderStatus)
  status?: PaymentOrderStatus

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

export class CreateManualPaymentOrderDto extends PaymentTenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(128)
  sourceBusinessNo: string

  @ApiProperty({ example: '100.00', description: '大于零、最多两位小数的金额字符串' })
  @IsString()
  @Matches(/^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d*(?:\.\d{1,2})?)$/)
  amount: unknown

  @ApiProperty({ example: 'CNY' })
  @Transform(upper)
  @Matches(/^[A-Z]{3,8}$/)
  currency: string

  @ApiProperty({ example: 'ALIPAY', enum: ['ALIPAY'] })
  @Transform(upper)
  @Matches(/^ALIPAY$/)
  paymentMethod: string

  @ApiProperty({ enum: PaymentExecutionMode })
  @IsEnum(PaymentExecutionMode)
  executionMode: PaymentExecutionMode

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  payeeIdentity: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  payeeName: string
}
