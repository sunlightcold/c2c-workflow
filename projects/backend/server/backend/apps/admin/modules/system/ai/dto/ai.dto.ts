import { AiAdapterCode, AiCapability } from '@/common/models'
import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

const normalizeText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value
const normalizeUrl = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value

export class CreateAiChannelDto {
  @ApiProperty({ description: '渠道编码', example: 'ephone-primary' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z][a-z0-9-]{1,62}$/)
  code: string

  @ApiProperty({ description: '渠道名称' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string

  @ApiProperty({ description: '供应商标识', example: 'ephone' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  supplier: string

  @ApiProperty({ enum: AiAdapterCode, description: '上游协议适配器' })
  @IsEnum(AiAdapterCode)
  adapterCode: AiAdapterCode

  @ApiProperty({ description: '上游 API 基础地址' })
  @Transform(normalizeUrl)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(512)
  baseUrl: string

  @ApiProperty({ description: 'API Key' })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  apiKey: string

  @ApiPropertyOptional({ default: 60000 })
  @IsInt()
  @Min(1000)
  @Max(900000)
  @IsOptional()
  timeoutMs?: number

  @ApiPropertyOptional({ default: 1, description: '渠道最大并发请求数' })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxConcurrency?: number

  @ApiPropertyOptional({ default: 20, description: '渠道最大排队请求数' })
  @IsInt()
  @Min(1)
  @Max(100000)
  @IsOptional()
  maxQueuedRequests?: number
}

export class UpdateAiChannelDto extends PartialType(
  PickType(CreateAiChannelDto, [
    'name',
    'supplier',
    'baseUrl',
    'timeoutMs',
    'maxConcurrency',
    'maxQueuedRequests',
  ]),
) {}

export class RotateAiChannelCredentialDto {
  @ApiProperty({ description: '新 API Key' })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  apiKey: string
}

export class TestAiChannelDto {
  @ApiProperty({ description: '测试模型 ID' })
  @IsUUID()
  modelId: string

  @ApiProperty({ enum: AiCapability })
  @IsEnum(AiCapability)
  capability: AiCapability
}

export class CreateAiModelDto {
  @ApiProperty({ description: '模型编码', example: 'gpt-vision-small' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z][a-z0-9._-]{1,118}$/)
  code: string

  @ApiProperty({ description: '模型名称' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name: string

  @ApiProperty({ enum: AiAdapterCode, description: '模型使用的上游协议适配器' })
  @IsEnum(AiAdapterCode)
  adapterCode: AiAdapterCode

  @ApiProperty({ description: '上游模型名' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  upstreamModel: string

  @ApiProperty({ enum: AiCapability, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(AiCapability, { each: true })
  capabilities: AiCapability[]

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}

export class UpdateAiModelDto extends PartialType(
  PickType(CreateAiModelDto, ['name', 'upstreamModel', 'capabilities', 'enabled']),
) {}

export class CreateAiFeatureRouteDto {
  @ApiProperty({ description: '业务功能编码', example: 'content.summary' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z][a-z0-9.-]{2,118}$/)
  featureCode: string

  @ApiProperty({ enum: AiCapability })
  @IsEnum(AiCapability)
  capability: AiCapability

  @ApiProperty()
  @IsUUID()
  modelId: string

  @ApiProperty()
  @IsUUID()
  channelId: string

  @ApiProperty()
  @IsInt()
  @Min(1)
  priority: number

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}

export class UpdateAiFeatureRouteDto extends PartialType(
  PickType(CreateAiFeatureRouteDto, ['priority', 'enabled']),
) {}

export class AiFeatureRouteFilterDto {
  @ApiPropertyOptional()
  @Transform(normalizeText)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  featureCode?: string
}
