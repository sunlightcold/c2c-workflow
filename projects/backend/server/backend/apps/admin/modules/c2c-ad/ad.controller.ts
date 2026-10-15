import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import { TenantContextDto } from '../business/business.dto'
import { AdListDto, AdRuleDto, AdRunListDto, AdScopeDto } from './ad.dto'
import { C2cAdService } from './ad.service'
import { AdPricingRunner } from './ad-pricing-runner.service'

const AdPermissions = definePermission('merchant:ad', [
  'read',
  'sync',
  'rule',
  'preview',
  'execute',
  'start',
  'stop',
] as const)
const AdRunPermissions = definePermission('merchant:adRun', ['read'] as const)

@ApiTags('C2C-买币广告')
@ApiBearerAuth()
@Controller()
export class C2cAdController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly ads: C2cAdService,
    private readonly runner: AdPricingRunner,
  ) {}

  @Get('merchant-ad-options/merchants')
  @Permission({
    anyOf: [AdPermissions.READ, AdPermissions.SYNC, AdPermissions.RULE, AdRunPermissions.READ],
  })
  @ApiOperation({ summary: '查询广告管理的商家选项' })
  merchantOptions(@Query() dto: TenantContextDto, @User() actor: AuthUser) {
    return this.ads.merchantOptions(this.scope.resolveTenantId(actor, dto.tenantId))
  }

  @Get('merchant-ads')
  @Permission(AdPermissions.READ)
  @ApiOperation({ summary: '分页查询买 USDT 广告' })
  list(@Query() dto: AdListDto, @User() actor: AuthUser) {
    return this.ads.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get('merchant-ads/:id')
  @Permission(AdPermissions.READ)
  @ApiOperation({ summary: '查询广告和统一策略' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: AdScopeDto,
    @User() actor: AuthUser,
  ) {
    return this.ads.detail(this.scope.resolveTenantId(actor, dto.tenantId), dto.merchantId, id)
  }

  @Post('merchants/:id/ads/sync')
  @Permission(AdPermissions.SYNC)
  @ApiOperation({ summary: '同步商家的买 USDT 广告' })
  sync(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.ads.sync(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Put('merchant-ads/:id/rule')
  @Permission(AdPermissions.RULE)
  @ApiOperation({ summary: '保存统一调价策略' })
  rule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdRuleDto, @User() actor: AuthUser) {
    return this.ads.saveRule(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      dto.rule,
    )
  }

  @Put('merchant-ads/:id/start')
  @Permission(AdPermissions.START)
  @ApiOperation({ summary: '开启自动调价' })
  start(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdScopeDto, @User() actor: AuthUser) {
    return this.ads.automation(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      true,
    )
  }

  @Put('merchant-ads/:id/stop')
  @Permission(AdPermissions.STOP)
  @ApiOperation({ summary: '暂停自动调价；在途请求继续回查' })
  stop(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdScopeDto, @User() actor: AuthUser) {
    return this.ads.automation(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      false,
    )
  }

  @Post('merchant-ads/:id/preview')
  @Permission(AdPermissions.PREVIEW)
  @ApiOperation({ summary: '按已保存策略试算；不提交改价' })
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdScopeDto,
    @User() actor: AuthUser,
  ) {
    return this.runner.run(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      'PREVIEW',
      String(actor.uid),
    )
  }

  @Post('merchant-ads/:id/execute')
  @Permission(AdPermissions.EXECUTE)
  @ApiOperation({ summary: '执行已保存策略；待核实广告只回查' })
  execute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdScopeDto,
    @User() actor: AuthUser,
  ) {
    return this.runner.run(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      'MANUAL',
      String(actor.uid),
    )
  }

  @Get('merchant-ad-runs')
  @Permission(AdRunPermissions.READ)
  @ApiOperation({ summary: '分页查询调价记录' })
  runs(@Query() dto: AdRunListDto, @User() actor: AuthUser) {
    return this.ads.listRuns(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get('merchant-ad-runs/:id')
  @Permission(AdRunPermissions.READ)
  @ApiOperation({ summary: '查询调价证据与回查结果' })
  runDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: AdScopeDto,
    @User() actor: AuthUser,
  ) {
    return this.ads.runDetail(this.scope.resolveTenantId(actor, dto.tenantId), dto.merchantId, id)
  }
}
