import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { PaymentSourceType } from '@admin/database'
import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import { CreateManualPaymentOrderDto, PaymentTenantContextDto } from './payment-order.dto'
import { PaymentOrderService } from './payment-order.service'

const PaymentOrderPermissions = definePermission('payment:order', ['create', 'retry'] as const)

@ApiTags('C2C-支付订单')
@ApiBearerAuth()
@Controller('payment-orders')
export class PaymentOrderController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly orders: PaymentOrderService,
  ) {}

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
}
