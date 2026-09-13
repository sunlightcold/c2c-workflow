import { Permission, User, definePermission } from '@/common/decorators'
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
import { BusinessScopeService } from '../business/business-scope.service'
import {
  CreatePaymentBatchPolicyDto,
  PaymentBatchPolicyListDto,
  SetPaymentBatchPolicyStatusDto,
  UpdatePaymentBatchPolicyDto,
} from './payment-batch-policy.dto'
import { PaymentBatchPolicyService } from './payment-batch-policy.service'
import { PaymentTenantContextDto } from './payment-order.dto'
import { C2cAutomaticPaymentService } from './c2c-automatic-payment.service'

const Permissions = definePermission('payment:batchPolicy', [
  'read',
  'create',
  'update',
  'delete',
] as const)

@ApiTags('C2C 支付批次策略')
@ApiBearerAuth()
@Controller('payment-batch-policies')
export class PaymentBatchPolicyController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly policies: PaymentBatchPolicyService,
    private readonly automaticPayments: C2cAutomaticPaymentService,
  ) {}

  @Get()
  @Permission(Permissions.READ)
  @ApiOperation({ summary: '分页查询支付批次策略及并行规则' })
  list(@Query() dto: PaymentBatchPolicyListDto, @User() actor: AuthUser) {
    return this.policies.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get(':id')
  @Permission(Permissions.READ)
  @ApiOperation({ summary: '查询支付批次策略详情' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.policies.detail(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post()
  @Permission(Permissions.CREATE)
  @ApiOperation({ summary: '创建支付批次策略和规则' })
  create(@Body() dto: CreatePaymentBatchPolicyDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.policies.create(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Put(':id')
  @Permission(Permissions.UPDATE)
  @ApiOperation({ summary: '编辑支付批次策略并整组替换规则' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentBatchPolicyDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.policies.update(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Patch(':id/status')
  @Permission(Permissions.UPDATE)
  @ApiOperation({ summary: '启用或停用支付批次策略' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPaymentBatchPolicyStatusDto,
    @User() actor: AuthUser,
  ) {
    return this.policies.setStatus(this.scope.resolveTenantId(actor, dto.tenantId), id, dto.status)
  }

  @Delete(':id')
  @Permission(Permissions.DELETE)
  @ApiOperation({ summary: '删除尚未使用的支付批次策略' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.policies.remove(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post(':id/submit')
  @Permission(Permissions.UPDATE)
  @ApiOperation({ summary: '按策略手动组批并提交当前待付款订单' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentTenantContextDto,
    @User() actor: AuthUser,
  ) {
    const tenantId = this.scope.resolveTenantId(actor, dto.tenantId)
    const policy = await this.policies.detail(tenantId, id)
    return this.automaticPayments.submitPolicyManually(tenantId, id, policy.merchantId)
  }
}
