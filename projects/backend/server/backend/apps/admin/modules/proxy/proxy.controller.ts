import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { SkipLog } from '@admin/interceptors/skip-log.decorator'
import { BusinessScopeService } from '../business/business-scope.service'
import { TenantContextDto } from '../business/business.dto'
import {
  BatchProxyDto,
  BindProxyDto,
  CreateProxyDto,
  DeleteProxiesDto,
  ImportProxyDto,
  ProxyListDto,
  UpdateProxyDto,
} from './proxy.dto'
import { ProxyService } from './proxy.service'
import { ProxyProbeService } from './proxy-probe.service'

const P = definePermission('system:proxy', [
  'read',
  'create',
  'update',
  'delete',
  'test',
  'quality',
  'import',
  'export',
  'bind',
] as const)
const M = definePermission('merchant:account', ['read', 'update'] as const)

@ApiTags('C2C-IP代理')
@ApiBearerAuth()
@Controller('proxies')
export class ProxyController {
  constructor(
    private readonly service: ProxyService,
    private readonly scope: BusinessScopeService,
    private readonly probes: ProxyProbeService,
  ) {}

  @Get()
  @Permission(P.READ)
  @ApiOperation({ summary: '查询代理' })
  list(@Query() dto: ProxyListDto, @User() user: AuthUser) {
    return this.service.list(this.scope.resolveTenantId(user, dto.tenantId), dto)
  }

  @Get('all')
  @Permission(P.READ)
  @ApiOperation({ summary: '查询可选代理' })
  all(@Query() dto: TenantContextDto, @User() user: AuthUser) {
    return this.service.all(this.scope.resolveTenantId(user, dto.tenantId))
  }

  @Get('data')
  @Permission(P.EXPORT)
  @ApiOperation({ summary: '导出代理数据（不含密码）' })
  exportData(@Query() dto: ProxyListDto, @User() user: AuthUser) {
    return this.service.exportData(this.scope.resolveTenantId(user, dto.tenantId), dto)
  }

  @Post()
  @Permission(P.CREATE)
  @SkipLog()
  @ApiOperation({ summary: '创建代理' })
  create(@Body() dto: CreateProxyDto, @User() user: AuthUser) {
    return this.service.create(this.scope.resolveTenantId(user, dto.tenantId), dto)
  }

  @Post('batch')
  @Permission(P.CREATE)
  @SkipLog()
  @ApiOperation({ summary: '批量添加代理' })
  batch(@Body() dto: BatchProxyDto, @User() user: AuthUser) {
    return this.service.batch(this.scope.resolveTenantId(user, dto.tenantId), dto.proxies)
  }

  @Post('data')
  @Permission(P.IMPORT)
  @SkipLog()
  @ApiOperation({ summary: '导入 sub2api 代理数据' })
  importData(@Body() dto: ImportProxyDto, @User() user: AuthUser) {
    return this.service.importData(this.scope.resolveTenantId(user, dto.tenantId), dto.data)
  }

  @Post('batch-delete')
  @Permission(P.DELETE)
  @ApiOperation({ summary: '批量删除未绑定代理' })
  removeMany(@Body() dto: DeleteProxiesDto, @User() user: AuthUser) {
    return this.service.removeMany(this.scope.resolveTenantId(user, dto.tenantId), dto.ids)
  }

  @Put('bindings/:merchantId')
  @Permission([P.BIND, M.UPDATE])
  @ApiOperation({ summary: '配置商家代理' })
  bind(
    @Param('merchantId', ParseUUIDPipe) id: string,
    @Body() dto: BindProxyDto,
    @User() user: AuthUser,
  ) {
    return this.service.bind(
      this.scope.resolveTenantId(user, dto.tenantId),
      id,
      dto.proxyId ?? null,
    )
  }

  @Put(':id')
  @Permission(P.UPDATE)
  @SkipLog()
  @ApiOperation({ summary: '编辑代理' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProxyDto,
    @User() user: AuthUser,
  ) {
    return this.service.update(this.scope.resolveTenantId(user, dto.tenantId), id, dto)
  }

  @Delete(':id')
  @Permission(P.DELETE)
  @ApiOperation({ summary: '删除未绑定代理' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() user: AuthUser,
  ) {
    return this.service.remove(this.scope.resolveTenantId(user, dto.tenantId), id)
  }

  @Get(':id/accounts')
  @Permission([P.READ, M.READ])
  @ApiOperation({ summary: '查询代理绑定商家' })
  accounts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() user: AuthUser,
  ) {
    return this.service.accounts(this.scope.resolveTenantId(user, dto.tenantId), id)
  }

  @Post(':id/test')
  @Permission(P.TEST)
  @ApiOperation({ summary: '代理连接测试' })
  test(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() user: AuthUser,
  ) {
    return this.probes.test(this.scope.resolveTenantId(user, dto.tenantId), id)
  }

  @Post(':id/quality-check')
  @Permission(P.QUALITY)
  @ApiOperation({ summary: '代理质量检测' })
  quality(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() user: AuthUser,
  ) {
    return this.probes.quality(this.scope.resolveTenantId(user, dto.tenantId), id)
  }
}
