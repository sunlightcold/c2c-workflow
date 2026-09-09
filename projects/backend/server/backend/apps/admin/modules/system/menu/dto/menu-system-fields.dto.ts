import { SysMenuSource } from '@/apps/admin/database'
import { StatusEnum } from '@/common/interfaces'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export class MenuSystemFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiProperty({ description: '菜单稳定标识', required: false, maxLength: 120 })
  key?: string

  @IsOptional()
  @IsEnum(SysMenuSource)
  @ApiProperty({ description: '菜单来源', required: false, enum: SysMenuSource })
  source?: SysMenuSource

  @IsOptional()
  @IsEnum(StatusEnum)
  @Type(() => Number)
  @ApiProperty({ description: '是否锁定：1启用，0禁用', enum: StatusEnum, required: false })
  locked?: StatusEnum
}
