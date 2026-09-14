import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import {
  CancelC2cMerchantOrderDto,
  ConfirmC2cMerchantPaidDto,
  CreateC2cMerchantPaymentDto,
} from './c2c-merchant-payment.dto'
import { C2cMerchantPaymentService } from './c2c-merchant-payment.service'

const MerchantOrderPermissions = definePermission('merchant:order', [
  'pay',
  'confirm_paid',
  'cancel',
] as const)

@ApiTags('C2C-商家订单')
@ApiBearerAuth()
@Controller('merchant-orders')
export class C2cMerchantPaymentController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly payments: C2cMerchantPaymentService,
  ) {}

  @Post(':id/payment')
  @Permission(MerchantOrderPermissions.PAY)
  @ApiOperation({ summary: '从商家订单创建支付；商家转账立即提交，批量有密等待组批' })
  @ApiParam({ name: 'id', description: '商家订单 ID', type: String })
  @ApiBadRequestResponse({ description: '商家订单当前不可支付或缺少完整收款资料' })
  @ApiConflictResponse({ description: '商家订单已存在支付订单，禁止重复创建' })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateC2cMerchantPaymentDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.create(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      dto.executionMode,
    )
  }

  @Post(':id/confirm-paid')
  @Permission(MerchantOrderPermissions.CONFIRM_PAID)
  @ApiOperation({ summary: '重试已成功支付订单的平台付款确认' })
  @ApiParam({ name: 'id', description: '商家订单 ID', type: String })
  confirmPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmC2cMerchantPaidDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.confirmPaid(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
    )
  }

  @Post(':id/cancel')
  @Permission(MerchantOrderPermissions.CANCEL)
  @ApiOperation({ summary: '作废尚未提交资金请求的商家订单' })
  @ApiParam({ name: 'id', description: '商家订单 ID', type: String })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelC2cMerchantOrderDto,
    @User() actor: AuthUser,
  ) {
    return this.payments.cancel(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      actor?.username ?? String(actor?.uid ?? 'unknown'),
      dto.reason,
    )
  }
}
