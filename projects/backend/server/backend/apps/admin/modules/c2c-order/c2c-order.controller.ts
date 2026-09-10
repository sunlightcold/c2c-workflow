import { definePermission, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { ValidateFilePipe } from '@/common/pipes'
import { getConfig } from '@/common/utils/config'
import { ValidationMatch } from '@/common/utils/regexp'
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { TenantContextDto } from '../business/business.dto'
import { BusinessScopeService } from '../business/business-scope.service'
import {
  MerchantOrderAppealSubmitDto,
  MerchantOrderDetailDto,
  MerchantOrderListDto,
} from './c2c-order.dto'
import { C2cOrderAppealService } from './c2c-order-appeal.service'
import { C2cOrderService } from './c2c-order.service'
import { C2cOrderSyncService } from './c2c-order-sync.service'

const MerchantOrderPermissions = definePermission('merchant:order', [
  'read',
  'sync',
  'appeal',
] as const)
const MAX_RECEIPT_SIZE = getConfig('admin').maxFileSize

@ApiTags('C2C-商家订单')
@ApiBearerAuth()
@Controller()
export class C2cOrderController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly orders: C2cOrderService,
    private readonly syncService: C2cOrderSyncService,
    private readonly appeals: C2cOrderAppealService,
  ) {}

  @Get('merchant-orders')
  @Permission(MerchantOrderPermissions.READ)
  @ApiOperation({ summary: '分页查询买币商家订单' })
  list(@Query() dto: MerchantOrderListDto, @User() actor: AuthUser) {
    return this.orders.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get('merchant-orders/:id')
  @Permission(MerchantOrderPermissions.READ)
  @ApiOperation({ summary: '查询买币商家订单详情' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: MerchantOrderDetailDto,
    @User() actor: AuthUser,
  ) {
    return this.orders.detail(this.scope.resolveTenantId(actor, dto.tenantId), dto.merchantId, id)
  }

  @Get('merchant-orders/:id/appeal-reasons')
  @Permission(MerchantOrderPermissions.APPEAL)
  @ApiOperation({ summary: '查询币安商家订单的实时申诉原因' })
  appealReasons(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: MerchantOrderDetailDto,
    @User() actor: AuthUser,
  ) {
    return this.appeals.getReasons(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
    )
  }

  @Post('merchant-orders/:id/appeal')
  @Permission(MerchantOrderPermissions.APPEAL)
  @ApiOperation({ summary: '提交币安商家订单申诉' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['merchantId', 'reasonCode', 'description', 'receipt'],
      properties: {
        tenantId: { type: 'string', format: 'uuid', description: '总部操作时选择的经营单位' },
        merchantId: { type: 'string', format: 'uuid' },
        reasonCode: { type: 'integer', minimum: 1 },
        description: { type: 'string', maxLength: 500 },
        receipt: { type: 'string', format: 'binary', description: '付款回单图片' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('receipt'))
  appeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MerchantOrderAppealSubmitDto,
    @UploadedFile(
      new ValidateFilePipe({
        maxFileSize: MAX_RECEIPT_SIZE,
        fileType: ValidationMatch.image.regExp,
      }),
    )
    receipt: Express.Multer.File,
    @User() actor: AuthUser,
  ) {
    return this.appeals.submit(
      this.scope.resolveTenantId(actor, dto.tenantId),
      dto.merchantId,
      id,
      {
        description: dto.description,
        fileName: receipt.originalname,
        receipt: receipt.buffer,
        reasonCode: dto.reasonCode,
      },
    )
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
