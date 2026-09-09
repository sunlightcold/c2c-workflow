import { SysStorageChannelProvider } from '@admin/database'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { STORAGE_KEY_PREFIX_PATTERN } from '../storage.types'
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'

const normalizeText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value
const normalizeUrl = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value

export class CreateStorageChannelDto {
  @ApiProperty({ description: '渠道编码', example: 'r2-public' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z][a-z0-9-]{1,62}$/)
  code: string

  @ApiProperty({ description: '渠道名称' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: SysStorageChannelProvider })
  @IsEnum(SysStorageChannelProvider)
  provider: SysStorageChannelProvider

  @ApiProperty({ description: 'S3 endpoint' })
  @Transform(normalizeUrl)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(512)
  endpoint: string

  @ApiPropertyOptional({ description: 'S3 region', default: 'auto' })
  @Transform(normalizeText)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string

  @ApiProperty({ description: 'Bucket 名称' })
  @Transform(normalizeText)
  @Matches(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
  bucket: string

  @ApiPropertyOptional({ description: '公开访问基础地址' })
  @Transform(normalizeUrl)
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(512)
  publicBaseUrl?: string

  @ApiPropertyOptional({ description: '使用 path-style 请求', default: true })
  @IsBoolean()
  @IsOptional()
  forcePathStyle?: boolean

  @ApiProperty({ description: 'Access Key ID' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  accessKeyId: string

  @ApiProperty({ description: 'Secret Access Key' })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  secretAccessKey: string
}

export class UpdateStorageChannelDto {
  @ApiPropertyOptional({ description: '渠道名称' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ description: '公开访问基础地址；传 null 清空' })
  @Transform(normalizeUrl)
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(512)
  publicBaseUrl?: string | null
}

export class RotateStorageChannelCredentialsDto {
  @ApiProperty({ description: 'Access Key ID' })
  @Transform(normalizeText)
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  accessKeyId: string

  @ApiProperty({ description: 'Secret Access Key' })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  secretAccessKey: string
}

export class BindStoragePurposeDto {
  @ApiProperty({ description: '存储渠道 ID' })
  @IsUUID()
  channelId: string

  @ApiPropertyOptional({
    description: '覆盖用途默认对象前缀；留空恢复默认前缀',
    example: 'avatars/',
    nullable: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(STORAGE_KEY_PREFIX_PATTERN, {
    message: 'keyPrefixOverride must be a safe path ending with /',
  })
  keyPrefixOverride?: string | null
}
