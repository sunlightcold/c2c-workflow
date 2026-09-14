import { definePermission, Permission } from '@/common/decorators'
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { TaskCreateDto, TaskFilterDto, TaskUpdateDto } from './dto'
import { TaskService } from './task.service'

const Permissions = definePermission('monitor:task', [
  'read',
  'delete',
  'create',
  'update',
  'once',
  'stop',
  'start',
] as const)

@ApiTags('系统-系统任务')
@ApiBearerAuth()
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({ summary: '任务管理-添加' })
  @ApiBody({ type: TaskCreateDto })
  @Permission(Permissions.CREATE)
  create(@Body() dto: TaskCreateDto) {
    const serviceCall = dto.service.split('.')
    this.taskService.checkServiceMeta(serviceCall[0], serviceCall[1])
    return this.taskService.create(dto)
  }

  @Put(':id')
  @ApiOperation({ summary: '任务管理-更新' })
  @ApiParam({ name: 'id', description: 'task ID', type: String })
  @ApiBody({ type: TaskUpdateDto })
  @Permission(Permissions.UPDATE)
  async update(@Param('id') id: string, @Body() dto: TaskUpdateDto) {
    if (dto.service) {
      const serviceCall = dto.service.split('.')
      this.taskService.checkServiceMeta(serviceCall[0], serviceCall[1])
    }
    return this.taskService.update(id, dto)
  }

  @Get('filter')
  @ApiOperation({ summary: '任务管理-查询' })
  @ApiQuery({ type: TaskFilterDto })
  @Permission(Permissions.READ)
  filter(@Query() query: TaskFilterDto) {
    return this.taskService.filter(query)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除任务' })
  @ApiParam({ name: 'id', description: '任务ID', type: String })
  @Permission(Permissions.DELETE)
  delete(@Param('id') id: string) {
    return this.taskService.delete(id)
  }

  @Put(':id/once')
  @ApiOperation({ summary: '手动执行一次任务' })
  @ApiParam({ name: 'id', description: '任务ID', type: String })
  @Permission(Permissions.ONCE)
  async once(@Param('id') id: string) {
    const task = await this.taskService.findOne(id)
    await this.taskService.once(task)
  }

  @Put(':id/stop')
  @ApiOperation({ summary: '停止任务' })
  @Permission(Permissions.STOP)
  async stop(@Param('id') id: string) {
    const task = await this.taskService.findOne(id)
    await this.taskService.stop(task!)
  }

  @Put(':id/start')
  @ApiOperation({ summary: '启动任务' })
  @Permission(Permissions.START)
  async start(@Param('id') id: string) {
    const task = await this.taskService.findOne(id)
    await this.taskService.start(task!)
  }
}
