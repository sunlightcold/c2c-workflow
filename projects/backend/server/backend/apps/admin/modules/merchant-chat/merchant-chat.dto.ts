import { Type } from 'class-transformer'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { MerchantOrderStatus, PaymentOrderStatus } from '@admin/database'
import { TenantContextDto } from '../business/business.dto'

export class ChatLiveDto extends TenantContextDto {
  @IsOptional() @IsUUID() merchantId?: string
}
export class ChatReplyDto extends TenantContextDto {
  @IsUUID() merchantId: string
  @IsUUID() conversationId: string
  @IsUUID() instanceId: string
  @IsUUID('4') requestId: string
  @IsOptional() @IsString() @MaxLength(4000) text?: string
}
export class ChatWindowDto extends TenantContextDto {
  @IsUUID() merchantId: string
  @IsUUID() instanceId: string
}
export class ChatOrderQueryDto extends ChatLiveDto {
  @IsOptional() @IsString() @MaxLength(128) platformOrderId?: string
  @IsOptional() @IsString() @MaxLength(128) counterpartyName?: string
  @IsOptional() @IsEnum(MerchantOrderStatus) status?: MerchantOrderStatus
  @IsOptional()
  @IsIn([...Object.values(PaymentOrderStatus), 'NOT_CREATED'])
  paymentStatus?: PaymentOrderStatus | 'NOT_CREATED'
  @Type(() => Number) @IsInt() @Min(1) page = 1
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20
}
export class ChatOpenConversationDto extends TenantContextDto {
  @IsUUID() merchantId: string
  @IsUUID() merchantOrderId: string
}
