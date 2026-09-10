import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { PaymentSourceType } from '@admin/database'
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import {
  CreateManualPaymentOrderDto,
  PaymentOrderListDto,
  PaymentTenantContextDto,
} from './payment-order.dto'
import { PaymentOrderService } from './payment-order.service'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'

const PaymentOrderPermissions = definePermission('payment:order', [
  'read',
  'create',
  'retry',
] as const)

@ApiTags('C2C-支付订单')
@ApiBearerAuth()
@Controller('payment-orders')
export class PaymentOrderController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly orders: PaymentOrderService,
    private readonly execution: PaymentExecutionCoordinator,
  ) {}

  @Get()
  @Permission(PaymentOrderPermissions.READ)
  @ApiOperation({ summary: '分页查询支付订单' })
  list(@Query() dto: PaymentOrderListDto, @User() actor: AuthUser) {
    return this.orders.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get(':id')
  @Permission(PaymentOrderPermissions.READ)
  @ApiOperation({ summary: '查询支付订单详情' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.orders.detail(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post()
  @Permission(PaymentOrderPermissions.CREATE)
  @ApiOperation({ summary: '创建机器人手工支付订单' })
  create(@Body() dto: CreateManualPaymentOrderDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.orders.create(this.scope.resolveTenantId(actor, tenantId), {
      ...input,
      amount: input.amount as string,
      sourceType: PaymentSourceType.BOT_MANUAL,
    })
  }

  @Post(':id/rematch')
  @Permission(PaymentOrderPermissions.RETRY)
  @ApiOperation({ summary: '重新匹配待配置支付订单' })
  rematch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.orders.rematch(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post(':id/reconcile')
  @Permission(PaymentOrderPermissions.RETRY)
  @ApiOperation({ summary: '使用原支付单号回查处理中或结果未知的支付订单' })
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.execution.reconcile(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }
}
