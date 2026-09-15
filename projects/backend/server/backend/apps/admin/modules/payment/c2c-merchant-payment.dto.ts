import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class CreateC2cMerchantPaymentDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @ApiProperty({ description: '商家账号 ID' })
  @IsUUID()
  merchantId: string
}

export class ConfirmC2cMerchantPaidDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @ApiProperty({ description: '商家账号 ID' })
  @IsUUID()
  merchantId: string
}

export class CancelC2cMerchantOrderDto extends ConfirmC2cMerchantPaidDto {
  @ApiProperty({ description: '作废原因', maxLength: 400 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  reason: string
}
