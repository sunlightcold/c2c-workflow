import { BusinessStatus, MerchantPlatform } from '@admin/database'
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value
const nonNegativeCnyAmountPattern = /^(?:0(?:\.\d{1,2}0*)?|[1-9]\d{0,17}(?:\.\d{1,2}0*)?)$/

export class TenantContextDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string
}

export class OrderStatisticMetricDto {
  @ApiProperty({ description: '订单金额，两位小数字符串', example: '1280.50' })
  amount: string

  @ApiProperty({ description: '订单数量', example: 12 })
  count: number
}

export class OrderStatisticsResponseDto {
  @ApiProperty({ type: OrderStatisticMetricDto })
  todaySuccess: OrderStatisticMetricDto

  @ApiProperty({ type: OrderStatisticMetricDto })
  yesterdaySuccess: OrderStatisticMetricDto

  @ApiProperty({ type: OrderStatisticMetricDto })
  todayPending: OrderStatisticMetricDto
}

export class CreateTenantDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string
}

export class SetTenantStatusDto {
  @ApiProperty({ enum: BusinessStatus })
  @IsEnum(BusinessStatus)
  status: BusinessStatus
}

export class CreateMerchantDto extends TenantContextDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: MerchantPlatform })
  @IsEnum(MerchantPlatform)
  platform: MerchantPlatform

  @ApiProperty({ description: '币安或欧易商家编号' })
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  externalMerchantId: string

  @ApiPropertyOptional({ description: '上游 API 地址；本地测试时填写 Mock 地址' })
  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(255)
  apiBaseUrl?: string

  @ApiPropertyOptional({ enum: ['API_KEY', 'WEB_COOKIE'] })
  @IsOptional()
  @IsIn(['API_KEY', 'WEB_COOKIE'])
  authMode?: 'API_KEY' | 'WEB_COOKIE'

  @ApiPropertyOptional({ description: '币安 API Key；创建币安账号时必填' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string

  @ApiPropertyOptional({ description: '币安 Secret Key；创建币安账号时必填' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secretKey?: string

  @ApiPropertyOptional({ description: '欧易网页 Cookie；创建欧易账号时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  sessionCookie?: string

  @ApiPropertyOptional({ description: '欧易 Authorization；创建欧易账号时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  authorization?: string

  @ApiPropertyOptional({
    description: '欧易 C2C EC 签名私钥，PKCS#8 DER Base64；创建欧易账号时必填',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  signaturePrivateKey?: string

  @ApiPropertyOptional({
    default: true,
    description: '是否跳过欧易付款凭证上传；关闭后自动付款必须提供回单图片',
  })
  @IsOptional()
  @IsBoolean()
  skipPaymentProofUpload?: boolean

  @ApiPropertyOptional({ default: 'WEB' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientType?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  xUserId?: string

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number

  @ApiPropertyOptional({ default: 120, minimum: 0, maximum: 3600 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  overlapSeconds?: number

  @ApiPropertyOptional({ default: [1], type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  orderStatusList?: number[]

  @ApiPropertyOptional({ default: 15000, minimum: 1000, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  requestTimeoutMs?: number

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  paidConfirmIntervalMinMs?: number

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  paidConfirmIntervalMaxMs?: number

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  c2cChatOrderCreatedEnabled?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  c2cChatOrderCreatedMessage?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  c2cChatOrderPaidEnabled?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  c2cChatOrderPaidMessage?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  c2cChatOrderCompletedEnabled?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  c2cChatOrderCompletedMessage?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoAppealEnabled?: boolean

  @ApiPropertyOptional({ default: 18, minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  autoAppealDelayMinutes?: number

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}

export class UpdateMerchantDto extends PartialType(
  OmitType(CreateMerchantDto, [
    'platform',
    'authMode',
    'apiKey',
    'secretKey',
    'sessionCookie',
    'authorization',
  ] as const),
) {
  @ApiPropertyOptional({
    description: '该商家账号已完成绑定的机器人群组；传 null 解除绑定',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  telegramGroupId?: string | null
}

export class MerchantListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  accountCode?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalMerchantId?: string

  @ApiPropertyOptional({ enum: MerchantPlatform })
  @IsOptional()
  @IsEnum(MerchantPlatform)
  platform?: MerchantPlatform

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}

export class PaymentAccountCredentialDto {
  @ApiProperty({ enum: ['KEY', 'CERT'], description: '支付宝签名模式' })
  @IsIn(['KEY', 'CERT'])
  authMode: 'CERT' | 'KEY'

  @ApiProperty({ description: '支付宝开放平台应用 ID' })
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(64)
  appId: string

  @ApiProperty({
    description: '支付宝 API 网关完整地址，支持官方地址、自定义代理网关和本地 Mock',
    example: 'https://payments.example.com/alipay/gateway.do',
  })
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  gateway: string

  @ApiProperty({ description: '应用私钥文件内容，保存后不回显' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  privateKey: string

  @ApiPropertyOptional({ description: '公钥模式：支付宝公钥文件内容，保存后不回显' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  alipayPublicKey?: string

  @ApiPropertyOptional({ description: '证书模式：应用公钥证书文件内容，保存后不回显' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  appCertContent?: string

  @ApiPropertyOptional({ description: '证书模式：支付宝公钥证书文件内容，保存后不回显' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  alipayPublicCertContent?: string

  @ApiPropertyOptional({ description: '证书模式：支付宝根证书文件内容，保存后不回显' })
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  alipayRootCertContent?: string
}

export class CreatePaymentAccountDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  platformId: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(128)
  externalAccountId: string

  @ApiProperty({ type: PaymentAccountCredentialDto, description: '该账号唯一的支付宝凭据' })
  @ValidateNested()
  @Type(() => PaymentAccountCredentialDto)
  credential: PaymentAccountCredentialDto
}

export class PatchPaymentAccountCredentialDto {
  @ApiProperty({ enum: ['KEY', 'CERT'], description: '支付宝签名模式' })
  @IsIn(['KEY', 'CERT'])
  authMode: 'CERT' | 'KEY'

  @ApiProperty({ description: '支付宝开放平台应用 ID' })
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(64)
  appId: string

  @ApiProperty({ description: '支付宝 API 网关完整地址' })
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  gateway: string

  @ApiPropertyOptional({ description: '新的应用私钥；不传则保留现有值' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  privateKey?: string

  @ApiPropertyOptional({ description: '公钥模式：新的支付宝公钥；不传则保留现有值' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  alipayPublicKey?: string

  @ApiPropertyOptional({ description: '证书模式：新的应用公钥证书；不传则保留现有值' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  appCertContent?: string

  @ApiPropertyOptional({ description: '证书模式：新的支付宝公钥证书；不传则保留现有值' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  alipayPublicCertContent?: string

  @ApiPropertyOptional({ description: '证书模式：新的支付宝根证书；不传则保留现有值' })
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  alipayRootCertContent?: string
}

export class UpdatePaymentAccountDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ description: '支付宝商户号' })
  @Transform(trim)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(128)
  externalAccountId?: string

  @ApiPropertyOptional({
    type: PatchPaymentAccountCredentialDto,
    description: '账号唯一的支付宝凭据；密钥或证书内容不传时保留原值',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchPaymentAccountCredentialDto)
  credential?: PatchPaymentAccountCredentialDto
}

export class PaymentAccountListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountCode?: string

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalAccountId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  platformId?: string

  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}

export class RotateMerchantPlatformCredentialDto extends TenantContextDto {
  @ApiPropertyOptional({ description: '币安 API Key' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string

  @ApiPropertyOptional({ description: '币安 Secret Key' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secretKey?: string

  @ApiPropertyOptional({ description: '欧易网页 Cookie' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  sessionCookie?: string

  @ApiPropertyOptional({ description: '欧易 Authorization' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  authorization?: string

  @ApiPropertyOptional({ description: '欧易 C2C EC 签名私钥，PKCS#8 DER Base64' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  signaturePrivateKey?: string

  @ApiPropertyOptional({
    default: true,
    description: '是否跳过欧易付款凭证上传；关闭后自动付款必须提供回单图片',
  })
  @IsOptional()
  @IsBoolean()
  skipPaymentProofUpload?: boolean

  @ApiPropertyOptional({ description: '币安客户端类型' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientType?: string

  @ApiPropertyOptional({ description: '币安用户标识' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  xUserId?: string

  @ApiPropertyOptional({ default: 5000, minimum: 1000, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  requestTimeoutMs = 15000
}

export class OpenPaymentAccountChannelDto extends TenantContextDto {
  @ApiProperty()
  @IsUUID()
  channelId: string

  @ApiPropertyOptional({ example: '1.00' })
  @IsOptional()
  @Matches(nonNegativeCnyAmountPattern)
  minimumAmount?: string

  @ApiPropertyOptional({ example: '50000.00' })
  @IsOptional()
  @Matches(nonNegativeCnyAmountPattern)
  maximumAmount?: string
}

export class UpdatePaymentAccountChannelDto extends TenantContextDto {
  @ApiPropertyOptional({ example: '1.00', nullable: true })
  @IsOptional()
  @Matches(nonNegativeCnyAmountPattern)
  minimumAmount?: string | null

  @ApiPropertyOptional({ example: '50000.00', nullable: true })
  @IsOptional()
  @Matches(nonNegativeCnyAmountPattern)
  maximumAmount?: string | null
}

export class PaymentPlanListDto extends TenantContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string
}

export class CreatePaymentPlanDto extends TenantContextDto {
  @ApiPropertyOptional({ default: false, description: '是否允许自动付款任务使用该方案' })
  @IsOptional()
  @IsBoolean()
  automaticPaymentEnabled?: boolean

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  batchPolicyId?: string | null

  @ApiProperty()
  @IsUUID()
  merchantId: string

  @ApiProperty()
  @IsUUID()
  paymentAccountId: string

  @ApiProperty()
  @IsUUID()
  paymentAccountChannelId: string

  @ApiProperty({ example: 'C2C_BUY' })
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  scene: string

  @ApiProperty({ example: 'CNY' })
  @Transform(upper)
  @Matches(/^[A-Z]{3,8}$/)
  currency: string

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  priority: number

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  weight: number
}

export class UpdatePaymentPlanDto extends TenantContextDto {
  @ApiPropertyOptional({ description: '是否允许自动付款任务使用该方案' })
  @IsOptional()
  @IsBoolean()
  automaticPaymentEnabled?: boolean

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  batchPolicyId?: string | null

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountChannelId?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number
}
