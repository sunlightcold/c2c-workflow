import {
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
  PlatformConfirmationStatus,
} from '@admin/database'
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
  @ApiPropertyOptional({
    description: '聚合搜索支付订单号、系统订单号、平台订单号或批次号',
    example: 'PAY202609150001',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  orderNo?: string

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

export class PaymentOrderStatisticsDto extends PaymentTenantContextDto {
  @ApiPropertyOptional({
    description: '聚合搜索支付订单号、系统订单号、平台订单号或批次号',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  orderNo?: string

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
}

export class PaymentOrderListItemDto {
  @ApiProperty({ format: 'uuid' }) id: string
  @ApiProperty({ format: 'uuid' }) tenantId: string
  @ApiProperty({ format: 'uuid' }) merchantId: string
  @ApiProperty({ enum: PaymentSourceType }) sourceType: PaymentSourceType
  @ApiProperty() sourceBusinessNo: string
  @ApiProperty() paymentNo: string
  @ApiProperty({ nullable: true, type: String }) batchNo: null | string
  @ApiProperty() amount: string
  @ApiProperty() currency: string
  @ApiProperty() paymentMethod: string
  @ApiProperty({ enum: PaymentExecutionMode }) executionMode: PaymentExecutionMode
  @ApiProperty() payeeIdentity: string
  @ApiProperty() payeeName: string
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) paymentPlanId: null | string
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) paymentAccountId: null | string
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  paymentAccountChannelId: null | string
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) batchPolicyId: null | string
  @ApiProperty({ enum: PaymentOrderStatus }) status: PaymentOrderStatus
  @ApiProperty({ nullable: true, type: String }) upstreamId: null | string
  @ApiProperty({ nullable: true, type: String }) lastError: null | string
  @ApiProperty({ enum: PlatformConfirmationStatus })
  platformConfirmStatus: PlatformConfirmationStatus
  @ApiProperty({ nullable: true, type: String }) platformConfirmLastError: null | string
  @ApiProperty({ format: 'date-time' }) createdAt: Date
  @ApiProperty({ format: 'date-time' }) updatedAt: Date
}

export class PaymentOrderListResponseDto {
  @ApiProperty({ type: [PaymentOrderListItemDto] }) items: PaymentOrderListItemDto[]
  @ApiProperty() total: number
  @ApiProperty() page: number
  @ApiProperty() pageSize: number
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
