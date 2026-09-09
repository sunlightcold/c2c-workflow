import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, MaxLength, IsString } from 'class-validator'

export class AccountUpdateDto {
  @IsOptional()
  @MaxLength(20)
  @IsString()
  @ApiProperty({ type: String, description: '用户昵称', required: false, maxLength: 20 })
  nickname?: string
}
