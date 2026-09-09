import { PaginationDto } from '@/common/dto'
import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class FilterUserFileDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: '用户名', required: false })
  username?: string

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string
}
