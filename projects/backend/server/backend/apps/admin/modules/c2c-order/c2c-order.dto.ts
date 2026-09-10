import { MerchantOrderStatus } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { TenantContextDto } from '../business/business.dto'

export class MerchantOrderListDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string

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

export class MerchantOrderDetailDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string
}

export class MerchantOrderAppealSubmitDto extends MerchantOrderDetailDto {
  @ApiProperty({ description: '币安实时返回的申诉原因码' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reasonCode: number

  @ApiProperty({ description: '申诉说明', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  description: string
}
