import { PaymentBatchStatus } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator'
import { PaymentTenantContextDto } from './payment-order.dto'

export class CreatePaymentBatchDto extends PaymentTenantContextDto {
  @ApiProperty({
    type: [String],
    description: '同一商家、支付账号、支付通道和币种下的待提交支付订单 ID，最多 500 笔',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  paymentOrderIds: string[]
}

export class PaymentBatchListDto extends PaymentTenantContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string

  @ApiPropertyOptional({ enum: PaymentBatchStatus })
  @IsOptional()
  @IsEnum(PaymentBatchStatus)
  status?: PaymentBatchStatus

  @ApiPropertyOptional({ description: '支付批次创建开始时间，ISO 8601' })
  @IsOptional()
  @IsDateString()
  startTime?: string

  @ApiPropertyOptional({ description: '支付批次创建结束时间，ISO 8601' })
  @IsOptional()
  @IsDateString()
  endTime?: string

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
