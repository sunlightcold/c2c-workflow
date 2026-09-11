import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from './business-scope.service'
import {
  CreateMerchantDto,
  CreatePaymentAccountDto,
  CreatePaymentPlanDto,
  CreateTenantDto,
  MerchantListDto,
  OpenPaymentAccountChannelDto,
  PaymentAccountListDto,
  PaymentPlanListDto,
  RotateMerchantPlatformCredentialDto,
  SetTenantStatusDto,
  TenantContextDto,
  UpdatePaymentAccountChannelDto,
  UpdatePaymentAccountDto,
  UpdateMerchantDto,
} from './business.dto'
import { MerchantService } from './merchant.service'
import { PaymentConfigService } from './payment-config.service'
import { TenantService } from './tenant.service'
import { MerchantPlatformCredentialService } from './merchant-platform-credential.service'

const TenantPermissions = definePermission('agency:tenant', ['read', 'create', 'update'] as const)
const MerchantPermissions = definePermission('merchant:account', [
  'read',
  'create',
  'update',
  'delete',
  'credential',
  'test',
] as const)
const PaymentPermissions = definePermission('payment:account', [
  'read',
  'create',
  'update',
  'delete',
  'bind',
] as const)

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
  listMerchants(@Query() dto: MerchantListDto, @User() actor: AuthUser) {
    return this.merchants.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Post('merchants')
  @Permission(MerchantPermissions.CREATE)
  @ApiOperation({ summary: '创建商家' })
  createMerchant(@Body() dto: CreateMerchantDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.merchants.create(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Put('merchants/:id')
  @Permission(MerchantPermissions.UPDATE)
  @ApiOperation({ summary: '编辑商家账号配置' })
  updateMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.merchants.update(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Patch('merchants/:id/status')
  @Permission(MerchantPermissions.UPDATE)
  @ApiOperation({ summary: '启用或停用商家账号' })
  setMerchantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @Body() statusDto: SetTenantStatusDto,
    @User() actor: AuthUser,
  ) {
    return this.merchants.setStatus(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
      statusDto.status,
    )
  }

  @Delete('merchants/:id')
  @Permission(MerchantPermissions.DELETE)
  @ApiOperation({ summary: '删除尚未产生订单的商家账号' })
  removeMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.merchants.remove(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post('merchants/:id/test')
  @Permission(MerchantPermissions.TEST)
  @ApiOperation({ summary: '测试商家账号与币安或欧易的连接' })
  testMerchantConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.platformCredentials.testConnection(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
    )
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

  @Put('payment-accounts/:id')
  @Permission(PaymentPermissions.UPDATE)
  @ApiOperation({ summary: '编辑支付账号' })
  updatePaymentAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentAccountDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.payments.updateAccount(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Patch('payment-accounts/:id/status')
  @Permission(PaymentPermissions.UPDATE)
  @ApiOperation({ summary: '启用或停用支付账号' })
  setPaymentAccountStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @Body() statusDto: SetTenantStatusDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.setAccountStatus(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
      statusDto.status,
    )
  }

  @Delete('payment-accounts/:id')
  @Permission(PaymentPermissions.DELETE)
  @ApiOperation({ summary: '删除尚未被业务使用的支付账号' })
  removePaymentAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.removeAccount(this.scope.resolveTenantId(actor, dto.tenantId), id)
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
  listPaymentAccounts(@Query() dto: PaymentAccountListDto, @User() actor: AuthUser) {
    return this.payments.listAccounts(this.scope.resolveTenantId(actor, dto.tenantId), dto)
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

  @Put('payment-accounts/:id/channels/:bindingId')
  @Permission(PaymentPermissions.BIND)
  @ApiOperation({ summary: '编辑支付账号通道参数' })
  updatePaymentChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
    @Body() dto: UpdatePaymentAccountChannelDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.payments.updateAccountChannel(
      this.scope.resolveTenantId(actor, tenantId),
      id,
      bindingId,
      input,
    )
  }

  @Patch('payment-accounts/:id/channels/:bindingId/status')
  @Permission(PaymentPermissions.BIND)
  @ApiOperation({ summary: '启用或停用支付账号通道' })
  setPaymentChannelStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
    @Query() dto: TenantContextDto,
    @Body() statusDto: SetTenantStatusDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.setAccountChannelStatus(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
      bindingId,
      statusDto.status,
    )
  }

  @Delete('payment-accounts/:id/channels/:bindingId')
  @Permission(PaymentPermissions.BIND)
  @ApiOperation({ summary: '移除尚未被业务使用的支付账号通道' })
  removePaymentChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.removeAccountChannel(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
      bindingId,
    )
  }

  @Post('payment-plans')
  @Permission(PaymentPermissions.BIND)
  @ApiOperation({ summary: '创建商家支付方案（固定支付账号及其通道）' })
  createPaymentPlan(@Body() dto: CreatePaymentPlanDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.payments.createPlan(this.scope.resolveTenantId(actor, tenantId), input)
  }
}
