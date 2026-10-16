import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
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
export class ChatAttachmentDto extends TenantContextDto {
  @IsUUID() merchantId: string
  @IsUUID() instanceId: string
}
