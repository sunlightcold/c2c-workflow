import { ClientErrorLevel, ClientErrorPlatform, ClientErrorSource } from '@/apps/admin/database'
import { PaginationDto } from '@/common/dto'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class ClientErrorBreadcrumbDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  category: string

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string

  @IsISO8601({ strict: true })
  timestamp: string
}

export class ClientErrorCreateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  eventId: string

  @ApiProperty({ example: 'magic-perler' })
  @Matches(/^[a-z0-9][a-z0-9-]{1,31}$/)
  appCode: string

  @ApiProperty({ example: 'production' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  environment: string

  @ApiProperty({ example: '3a8e870c' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  release: string

  @ApiProperty({ enum: ClientErrorPlatform })
  @IsEnum(ClientErrorPlatform)
  platform: ClientErrorPlatform

  @ApiProperty({ enum: ClientErrorLevel })
  @IsEnum(ClientErrorLevel)
  level: ClientErrorLevel

  @ApiProperty({ enum: ClientErrorSource })
  @IsEnum(ClientErrorSource)
  source: ClientErrorSource

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  errorType?: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64000)
  stack?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64000)
  componentStack?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  route?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  feature?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sessionId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userRef?: string

  @ApiPropertyOptional({ type: [ClientErrorBreadcrumbDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClientErrorBreadcrumbDto)
  breadcrumbs?: ClientErrorBreadcrumbDto[]

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  occurredAt: string
}

export class ClientErrorFilterDto extends PaginationDto {
  @Max(100)
  declare pageSize: number

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{1,31}$/)
  appCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  release?: string

  @ApiPropertyOptional({ enum: ClientErrorPlatform })
  @IsOptional()
  @IsEnum(ClientErrorPlatform)
  platform?: ClientErrorPlatform

  @ApiPropertyOptional({ enum: ClientErrorLevel })
  @IsOptional()
  @IsEnum(ClientErrorLevel)
  level?: ClientErrorLevel

  @ApiPropertyOptional({ enum: ClientErrorSource })
  @IsOptional()
  @IsEnum(ClientErrorSource)
  source?: ClientErrorSource

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startedAt?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endedAt?: string
}
