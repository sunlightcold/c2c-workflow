import { PaginationDto } from '@/common/dto'
import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class LogCreateDto {
  @IsString()
  @ApiProperty({ description: '系统模块标题' })
  title: string

  @IsString()
  @ApiProperty({ description: '调用内容描述' })
  content: string

  @IsString()
  @ApiProperty({ description: '调用方法' })
  serviceMethod: string

  @IsString()
  @ApiProperty({ description: '请求方式' })
  httpMethod: string

  @IsString()
  @ApiProperty({ description: 'ip地址' })
  ip: string

  @IsString()
  @ApiProperty({ description: '请求地址' })
  url: string

  @IsString()
  @ApiProperty({ description: '操作系统' })
  os: string

  @IsString()
  @ApiProperty({ description: '浏览器' })
  browser: string

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '城市' })
  city?: string

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '国家' })
  country?: string

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '地区/省' })
  region?: string

  @IsString()
  @ApiProperty({ description: '客户端 agent' })
  agent: string

  @IsString()
  @ApiProperty({ description: '操作人员' })
  username: string

  @IsString()
  @ApiProperty({ description: 'params 参数' })
  params: string

  @IsString()
  @ApiProperty({ description: 'body 参数' })
  body: string

  @IsString()
  @ApiProperty({ description: 'query 参数' })
  query: string
}

export class LogFilterDto extends IntersectionType(
  PaginationDto,
  PartialType(PickType(LogCreateDto, ['title', 'content'])),
) {}
