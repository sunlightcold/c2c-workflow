import { definePermission, Permission } from '@/common/decorators'
import { Controller, Delete, Get, Inject, Param, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { OnlineFilterDto } from './dto'
import { OnlineService } from './online.service'

const Permissions = definePermission('monitor:online', ['read', 'delete'] as const)

@ApiTags('系统-后台 Token 会话管理')
@ApiBearerAuth()
@Controller('online')
export class OnlineController {
  @Inject(OnlineService) private readonly onlineService: OnlineService

  @Get('filter')
  @ApiOperation({ summary: '后台 Token 会话-查询' })
  @Permission(Permissions.READ)
  filter(@Query() query: OnlineFilterDto) {
    return this.onlineService.filter(query)
  }

  @Delete('kick/:id')
  @ApiOperation({ summary: '后台 Token 会话-撤销' })
  @ApiParam({ name: 'id', description: 'admin token session ID', type: String })
  @Permission(Permissions.DELETE)
  async kick(@Param('id') id: string) {
    return this.onlineService.kick(id)
  }
}
