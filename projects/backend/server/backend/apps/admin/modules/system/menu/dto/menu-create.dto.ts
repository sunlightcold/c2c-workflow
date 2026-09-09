import { SysMenuType } from '@/apps/admin/database'
import { OperatorDto } from '@/common/dto'
import { StatusEnum } from '@/common/interfaces'
import { ApiProperty } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'

export class MenuCreateDto extends OperatorDto {
  @IsOptional()
  @Transform((prams) => (prams.value ? Number(prams.value) : null))
  @ApiProperty({ description: '上级菜单ID', required: false })
  parentId?: number | null

  @IsString()
  @ApiProperty({ description: '菜单名称', required: true })
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: '路由地址', required: false, maxLength: 100 })
  path?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: '组件路径', required: false, maxLength: 100 })
  component?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ description: '权限标识', required: false, maxLength: 100 })
  permission?: string

  @IsEnum(SysMenuType)
  @ApiProperty({ description: '权限标识', required: true, enum: SysMenuType })
  type: SysMenuType

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '菜单图标', required: false })
  icon?: string

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '内嵌外链地址', required: false })
  iframeSrc?: string

  @IsEnum(StatusEnum)
  @Type(() => Number)
  @ApiProperty({ description: '状态：1启用，0禁用', enum: StatusEnum, required: false })
  status: StatusEnum

  @IsOptional()
  @IsEnum(StatusEnum)
  @ApiProperty({ description: '是否缓存菜单：1启用，0禁用', enum: StatusEnum, required: false })
  keepAlive: StatusEnum

  @IsEnum(StatusEnum)
  @ApiProperty({ description: '是否显示菜单：1启用，0禁用', enum: StatusEnum, required: false })
  show: StatusEnum

  @IsOptional()
  @IsInt()
  @ApiProperty({ description: '排序编号', required: false, default: 0 })
  orderNo?: number
}
