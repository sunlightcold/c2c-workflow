import { MerchantOrderStatus } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { TenantContextDto } from '../business/business.dto'

export class MerchantOrderListDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string

  @ApiPropertyOptional({ enum: MerchantOrderStatus })
  @IsOptional()
  @IsEnum(MerchantOrderStatus)
  status?: MerchantOrderStatus

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
