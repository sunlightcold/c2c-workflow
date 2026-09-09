import { PaginationDto } from '@/common/dto'
import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import { SysOnlineUserStatus } from '@/apps/admin/database'

export class OnlineCreateDto {
  @IsString({ message: 'ip地址类型错误' })
  @ApiProperty({ description: 'ip地址' })
  ip: string

  @IsString({ message: '操作系统类型错误' })
  @ApiProperty({ description: '操作系统' })
  os: string

  @IsString({ message: '浏览器类型错误' })
  @ApiProperty({ description: '浏览器' })
  browser: string

  @IsString({ message: '城市类型错误' })
  @ApiProperty({ description: '城市' })
  city?: string

  @IsString({ message: '国家类型错误' })
  @ApiProperty({ description: '国家' })
  country?: string

  @IsString({ message: '地区/省类型错误' })
  @ApiProperty({ description: '地区/省' })
  region?: string

  @IsString({ message: 'agent 类型错误' })
  @ApiProperty({ description: '客户端 agent' })
  agent: string

  @IsDate()
  @ApiProperty({ description: '令牌过期时间' })
  expiredAt: Date

  @IsString({ message: '登录token错误ID' })
  @ApiProperty({ description: '登录tokenID' })
  accessTokenId: string

  @IsInt({ message: '用户ID错误' })
  @ApiProperty({ description: '用户ID' })
  userId: number
}

export class OnlineFilterDto extends IntersectionType(PaginationDto) {
  @IsOptional()
  @MaxLength(20)
  @IsString()
  @ApiProperty({ description: '用户名' })
  username?: string

  @IsOptional()
  @MaxLength(20)
  @IsString()
  @ApiProperty({ description: '用户昵称' })
  nickname?: string

  @IsOptional()
  @IsEnum(SysOnlineUserStatus)
  @ApiProperty({ description: 'Token 会话状态', enum: SysOnlineUserStatus, required: false })
  status?: SysOnlineUserStatus
}
