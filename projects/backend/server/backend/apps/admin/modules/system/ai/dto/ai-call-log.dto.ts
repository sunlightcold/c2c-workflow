import { PaginationDto } from '@/common/dto'
import { AiCapability } from '@/common/models'
import { ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger'
import { AiCallLogStatus } from '../ai.types'
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

class AiCallLogFilterFields {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  featureCode?: string

  @ApiPropertyOptional({ enum: AiCapability })
  @IsOptional()
  @IsEnum(AiCapability)
  capability?: AiCapability

  @ApiPropertyOptional({ enum: AiCallLogStatus })
  @IsOptional()
  @IsEnum(AiCallLogStatus)
  status?: AiCallLogStatus

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelCode?: string

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelCode?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  startedAt?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  endedAt?: string
}

export class AiCallLogFilterDto extends IntersectionType(
  PaginationDto,
  PartialType(AiCallLogFilterFields),
) {}

export class AiCallLogStatsDto extends PartialType(AiCallLogFilterFields) {}
