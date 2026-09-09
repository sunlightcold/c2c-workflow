import { SysParamsTypeEnum } from '@/apps/admin/database'
import { CreateOperatorDto, PaginationDto } from '@/common/dto'
import { ApiProperty, IntersectionType, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export class ParamsCreateDto extends CreateOperatorDto {
  @IsString()
  @ApiProperty({ description: '参数名称' })
  name: string

  @IsString()
  @ApiProperty({ description: '参数健' })
  key: string

  @IsString()
  @ApiProperty({ description: '参数值' })
  value: string

  @IsEnum(SysParamsTypeEnum)
  @Type(() => Number)
  @ApiProperty({ enum: SysParamsTypeEnum, description: '参数类型' })
  type: SysParamsTypeEnum

  @IsOptional()
  @MaxLength(200)
  @IsString()
  @ApiProperty({ description: '描述', required: false, maxLength: 200 })
  description?: string
}

export class ParamsUpdateDto extends PartialType(ParamsCreateDto) {}

export class ParamsFilterDto extends IntersectionType(PaginationDto, ParamsUpdateDto) {}
