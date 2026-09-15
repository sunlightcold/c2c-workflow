import { ApiResult, Permission, User } from '@/common/decorators'
import type { AuthUser } from '@/common/interfaces'
import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business/business-scope.service'
import { DashboardOverviewDto, DashboardOverviewQueryDto } from './dashboard.dto'
import { DashboardService } from './dashboard.service'

@ApiTags('C2C-工作台')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('overview')
  @Permission('dashboard:workspace')
  @ApiOperation({ summary: '查询所属单位经营工作台聚合数据' })
  @ApiResult({ type: DashboardOverviewDto })
  overview(@Query() dto: DashboardOverviewQueryDto, @User() actor: AuthUser) {
    return this.dashboard.overview(this.scope.resolveTenantId(actor, dto.tenantId), dto.days)
  }
}
