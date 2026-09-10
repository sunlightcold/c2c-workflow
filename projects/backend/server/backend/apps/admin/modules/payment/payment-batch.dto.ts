import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator'
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
