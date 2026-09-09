import { OperatorDto, PaginationDto } from '@/common/dto'
import { StatusEnum } from '@/common/interfaces'
import { ApiProperty, IntersectionType, OmitType, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator'

export class RoleCreateDto extends OperatorDto {
  @IsString()
  @ApiProperty({ description: '角色标识' })
  value: string

  @IsString()
  @ApiProperty({ description: '角色名称' })
  name: string

  @IsOptional()
  @IsEnum(StatusEnum)
  @Type(() => Number)
  @ApiProperty({
    enum: StatusEnum,
    type: Number,
    description: '状态：1启用，0禁用',
    required: false,
  })
  status?: StatusEnum

  @IsString()
  @IsOptional()
  @ApiProperty({ maxLength: 100, description: '角色描述', required: false })
  description?: string

  @IsArray()
  @IsOptional()
  @ApiProperty({ type: [String], description: '关联菜单ID集合', required: false })
  menuIds?: string[]
}

export class RoleUpdateDto extends PartialType(RoleCreateDto) {}

export class RoleFilterDto extends IntersectionType(
  PaginationDto,
  PartialType(OmitType(RoleCreateDto, ['menuIds'])),
) {}

export class RoleListDto extends PartialType(OmitType(RoleCreateDto, ['menuIds'])) {}
