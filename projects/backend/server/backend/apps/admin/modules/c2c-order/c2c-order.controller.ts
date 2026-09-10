import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { TenantContextDto } from '../business/business.dto'
import { BusinessScopeService } from '../business/business-scope.service'
import { MerchantOrderDetailDto, MerchantOrderListDto } from './c2c-order.dto'
import { C2cOrderService } from './c2c-order.service'
import { C2cOrderSyncService } from './c2c-order-sync.service'

const MerchantOrderPermissions = definePermission('merchant:order', ['read', 'sync'] as const)

@ApiTags('C2C-商家订单')
@ApiBearerAuth()
@Controller()
export class C2cOrderController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly orders: C2cOrderService,
    private readonly syncService: C2cOrderSyncService,
  ) {}

  @Get('merchant-orders')
  @Permission(MerchantOrderPermissions.READ)
  list(@Query() dto: MerchantOrderListDto, @User() actor: AuthUser) {
    return this.orders.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get('merchant-orders/:id')
  @Permission(MerchantOrderPermissions.READ)
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: MerchantOrderDetailDto,
    @User() actor: AuthUser,
  ) {
    return this.orders.detail(this.scope.resolveTenantId(actor, dto.tenantId), dto.merchantId, id)
  }

  @Post('merchants/:id/orders/sync')
  @Permission(MerchantOrderPermissions.SYNC)
  @ApiOperation({ summary: '同步指定商家的买币订单' })
  sync(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.syncService.sync(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }
}
