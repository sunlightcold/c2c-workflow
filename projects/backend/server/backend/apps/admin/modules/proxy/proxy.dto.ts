import { TenantContextDto } from '../business/business.dto'
import { PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { PROXY_PROTOCOLS, type ProxyProtocol } from '@admin/database'

export class ProxyFieldsDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string
  @IsIn(PROXY_PROTOCOLS) protocol: ProxyProtocol
  @IsString() @MaxLength(255) host: string
  @IsInt() @Min(1) @Max(65535) port: number
  @IsOptional() @IsString() @MaxLength(255) username?: string
  @IsOptional() @IsString() @MaxLength(1024) password?: string
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive'
  @IsOptional() @IsInt() @Min(0) @Max(253402300799) expires_at?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(36500) expiry_warn_days?: number
  @IsOptional() @IsIn(['none', 'proxy', 'direct']) fallback_mode?: 'none' | 'proxy' | 'direct'
  @IsOptional() @IsUUID() backup_proxy_id?: string | null
}
export class CreateProxyDto extends ProxyFieldsDto {
  @IsOptional() @IsUUID() tenantId?: string
}
export class UpdateProxyDto extends PartialType(CreateProxyDto) {}
export class ProxyListDto extends TenantContextDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page_size = 20
  @IsOptional() @IsString() @MaxLength(100) search?: string
  @IsOptional() @IsIn(['', ...PROXY_PROTOCOLS]) protocol?: ProxyProtocol | ''
  @IsOptional() @IsIn(['', 'active', 'inactive', 'expired']) status?: string
  @IsOptional()
  @IsIn(['id', 'name', 'protocol', 'status', 'created_at', 'expiry', 'account_count'])
  sort_by?: string
  @IsOptional() @IsIn(['asc', 'desc']) sort_order?: 'asc' | 'desc'
  @IsOptional() @IsString() @MaxLength(40000) ids?: string
}
export class BatchProxyDto extends TenantContextDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ProxyFieldsDto)
  proxies: ProxyFieldsDto[]
}
export class ImportProxyDto extends TenantContextDto {
  @IsObject() data: Record<string, unknown>
}
export class DeleteProxiesDto extends TenantContextDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  ids: string[]
}
export class BindProxyDto extends TenantContextDto {
  @IsOptional() @IsUUID() proxyId: string | null
}
