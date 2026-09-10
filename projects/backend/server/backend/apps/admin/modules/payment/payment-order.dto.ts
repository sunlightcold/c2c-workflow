import { PaymentExecutionMode } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
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
