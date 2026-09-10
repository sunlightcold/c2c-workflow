import { Permission, User, definePermission } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import { CreatePaymentBatchDto } from './payment-batch.dto'
import { PaymentBatchService } from './payment-batch.service'

const PaymentBatchPermissions = definePermission('payment:batch', ['create'] as const)

@ApiTags('C2C 支付批次')
@ApiBearerAuth()
@Controller('payment-batches')
export class PaymentBatchController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly batches: PaymentBatchService,
  ) {}

  @Post()
  @Permission(PaymentBatchPermissions.CREATE)
  @ApiOperation({ summary: '按完整隔离维度创建支付宝批量有密支付批次' })
  create(@Body() dto: CreatePaymentBatchDto, @User() actor: AuthUser) {
    return this.batches.create(this.scope.resolveTenantId(actor, dto.tenantId), dto.paymentOrderIds)
  }
}
