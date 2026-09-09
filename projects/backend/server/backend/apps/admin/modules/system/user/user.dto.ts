import { OperatorDto, PaginationDto } from '@/common/dto'
import { StatusEnum } from '@/common/interfaces'
import { ValidationMatch } from '@/common/utils'
import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'

export class UserCreateDto extends OperatorDto {
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(ValidationMatch.username.regExp, {
    message: ValidationMatch.username.message,
  })
  @ApiProperty({ type: String, description: '用户名', required: true, maxLength: 20 })
  username: string

  @IsNotEmpty()
  @MaxLength(40)
  @Matches(ValidationMatch.password.regExp, {
    message: ValidationMatch.password.message,
  })
  @ApiProperty({ type: String, description: '用户密码', required: true, maxLength: 40 })
  password: string

  @IsOptional()
  @IsEnum(StatusEnum)
  @Type(() => Number)
  @ApiProperty({ enum: StatusEnum, description: '状态：1启用，0禁用', required: false })
  status?: StatusEnum

  @IsOptional()
  @Matches(ValidationMatch.nickname.regExp, {
    message: ValidationMatch.nickname.message,
  })
  @ApiProperty({ type: String, description: '用户昵称', required: false })
  nickname?: string

  @IsOptional()
  @IsString()
  @ApiProperty({ type: String, description: '用户头像', required: false })
  avatar?: string

  @IsOptional()
  @IsArray()
  @ApiProperty({ type: [Number], description: '关联角色ID集合', required: false })
  roleIds?: number[]

  @IsOptional()
  @MaxLength(100)
  @IsString({ message: '备注' })
  @ApiProperty({ description: '用户备注', required: false, maxLength: 100 })
  description?: string
}

export class UserUpdateDto extends PickType(UserCreateDto, [
  'nickname',
  'status',
  'avatar',
  'roleIds',
  'description',
] as const) {}

export class UserFilterDto extends IntersectionType(
  PaginationDto,
  PartialType(PickType(UserCreateDto, ['status', 'description'] as const)),
) {
  @IsOptional()
  @MaxLength(20)
  @ApiProperty({ type: String, description: '用户名', required: true, maxLength: 20 })
  username?: string

  @IsOptional()
  @ApiProperty({ type: String, description: '用户昵称', required: false })
  nickname?: string
}
