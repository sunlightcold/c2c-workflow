import { Permission, User, definePermission } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import { CreatePaymentBatchDto } from './payment-batch.dto'
import { PaymentBatchService } from './payment-batch.service'
import { PaymentBatchExecutionCoordinator } from './payment-batch-execution-coordinator'
import { PaymentTenantContextDto } from './payment-order.dto'

const PaymentBatchPermissions = definePermission('payment:batch', [
  'create',
  'submit',
  'retry',
] as const)

@ApiTags('C2C 支付批次')
@ApiBearerAuth()
@Controller('payment-batches')
export class PaymentBatchController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly batches: PaymentBatchService,
    private readonly execution: PaymentBatchExecutionCoordinator,
  ) {}

  @Post()
  @Permission(PaymentBatchPermissions.CREATE)
  @ApiOperation({ summary: '按完整隔离维度创建支付宝批量有密支付批次' })
  create(@Body() dto: CreatePaymentBatchDto, @User() actor: AuthUser) {
    return this.batches.create(this.scope.resolveTenantId(actor, dto.tenantId), dto.paymentOrderIds)
  }

  @Post(':id/submit')
  @Permission(PaymentBatchPermissions.SUBMIT)
  @ApiOperation({ summary: '提交支付宝批量有密支付批次' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.execution.submit(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post(':id/reconcile')
  @Permission(PaymentBatchPermissions.RETRY)
  @ApiOperation({ summary: '使用原批次号回查支付宝批次及逐笔结果' })
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.execution.reconcile(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }
}
