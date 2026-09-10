import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from './business-scope.service'
import {
  CreateMerchantDto,
  CreatePaymentAccountDto,
  CreatePaymentPlanDto,
  CreateTenantDto,
  OpenPaymentAccountChannelDto,
  PaymentPlanListDto,
  RotateMerchantPlatformCredentialDto,
  SetTenantStatusDto,
  TenantContextDto,
} from './business.dto'
import { MerchantService } from './merchant.service'
import { PaymentConfigService } from './payment-config.service'
import { TenantService } from './tenant.service'
import { MerchantPlatformCredentialService } from './merchant-platform-credential.service'

const TenantPermissions = definePermission('agency:tenant', ['read', 'create', 'update'] as const)
const MerchantPermissions = definePermission('merchant:account', [
  'read',
  'create',
  'credential',
] as const)
const PaymentPermissions = definePermission('payment:account', ['read', 'create', 'bind'] as const)

@ApiTags('C2C-业务配置')
@ApiBearerAuth()
@Controller()
export class BusinessController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly tenants: TenantService,
    private readonly merchants: MerchantService,
    private readonly payments: PaymentConfigService,
    private readonly platformCredentials: MerchantPlatformCredentialService,
  ) {}

  @Get('tenants')
  @Permission(TenantPermissions.READ)
  @ApiOperation({ summary: '查询所属单位' })
  listTenants() {
    return this.tenants.list()
  }

  @Post('tenants')
  @Permission(TenantPermissions.CREATE)
  @ApiOperation({ summary: '创建代理商所属单位' })
  createTenant(@Body() dto: CreateTenantDto) {
    return this.tenants.create({ ...dto, timezone: dto.timezone ?? 'Asia/Shanghai' })
  }

  @Patch('tenants/:id/status')
  @Permission(TenantPermissions.UPDATE)
  @ApiOperation({ summary: '修改所属单位状态' })
  setTenantStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetTenantStatusDto) {
    return this.tenants.setStatus(id, dto.status)
  }

  @Get('merchants')
  @Permission(MerchantPermissions.READ)
  @ApiOperation({ summary: '查询商家' })
  listMerchants(@Query() dto: TenantContextDto, @User() actor: AuthUser) {
    return this.merchants.list(this.scope.resolveTenantId(actor, dto.tenantId))
  }

  @Post('merchants')
  @Permission(MerchantPermissions.CREATE)
  @ApiOperation({ summary: '创建商家' })
  createMerchant(@Body() dto: CreateMerchantDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.merchants.create(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Get('merchants/:id/platform-credentials')
  @Permission(MerchantPermissions.READ)
  @ApiOperation({ summary: '查询商家平台凭据版本' })
  listMerchantPlatformCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.platformCredentials.list(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post('merchants/:id/platform-credentials')
  @Permission(MerchantPermissions.CREDENTIAL)
  @ApiOperation({ summary: '更新商家平台凭据' })
  rotateMerchantPlatformCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateMerchantPlatformCredentialDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.platformCredentials.rotate(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Post('payment-accounts')
  @Permission(PaymentPermissions.CREATE)
  @ApiOperation({ summary: '创建支付账号' })
  createPaymentAccount(@Body() dto: CreatePaymentAccountDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.payments.createAccount(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Get('payment-platforms')
  @Permission(PaymentPermissions.READ)
  @ApiOperation({ summary: '查询支付平台及通道目录' })
  listPaymentCatalog() {
    return this.payments.listCatalog()
  }

  @Get('payment-accounts')
  @Permission(PaymentPermissions.READ)
  @ApiOperation({ summary: '查询支付账号' })
  listPaymentAccounts(@Query() dto: TenantContextDto, @User() actor: AuthUser) {
    return this.payments.listAccounts(this.scope.resolveTenantId(actor, dto.tenantId))
  }

  @Get('payment-plans')
  @Permission(PaymentPermissions.READ)
  @ApiOperation({ summary: '查询商家支付方案' })
  listPaymentPlans(@Query() dto: PaymentPlanListDto, @User() actor: AuthUser) {
    return this.payments.listPlans(this.scope.resolveTenantId(actor, dto.tenantId), dto.merchantId)
  }

  @Post('payment-accounts/:id/channels')
  @Permission(PaymentPermissions.BIND)
  @ApiOperation({ summary: '开通支付账号通道' })
  openPaymentChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenPaymentAccountChannelDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.payments.openAccountChannel(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Post('payment-plans')
  @Permission(PaymentPermissions.BIND)
  @ApiOperation({ summary: '创建商家支付方案（固定支付账号及其通道）' })
  createPaymentPlan(@Body() dto: CreatePaymentPlanDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.payments.createPlan(this.scope.resolveTenantId(actor, tenantId), input)
  }
}
