import { definePermission, Permission } from '@/common/decorators'
import { Controller, Get, Inject, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { LogFilterDto, TaskLogFilterDto } from './dto'
import { LogService } from './log.service'
import { TaskLogService } from './task-log.service'

const Permissions = definePermission('monitor:log', ['read', 'delete'] as const)
const TaskLogPermissions = definePermission('monitor:taskLog', ['read'] as const)

@ApiTags('系统-系统日志')
@ApiBearerAuth()
@Controller('logs')
export class LogController {
  @Inject(LogService) private readonly logService: LogService
  @Inject(TaskLogService) private readonly taskLogService: TaskLogService

  @Get('filter')
  @ApiOperation({ summary: '日志管理-查询' })
  @Permission(Permissions.READ)
  filter(@Query() query: LogFilterDto) {
    return this.logService.filter(query)
  }

  @Get('task/filter')
  @ApiOperation({ summary: '任务日志-查询' })
  @Permission(TaskLogPermissions.READ)
  filterTaskLog(@Query() query: TaskLogFilterDto) {
    return this.taskLogService.filter(query)
  }
}
