import { definePermission, Permission } from '@/common/decorators'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiChannelService } from './ai-channel.service'
import { AiFeatureRouteService } from './ai-feature-route.service'
import { AiModelService } from './ai-model.service'
import {
  AiFeatureRouteFilterDto,
  CreateAiChannelDto,
  CreateAiFeatureRouteDto,
  CreateAiModelDto,
  RotateAiChannelCredentialDto,
  TestAiChannelDto,
  UpdateAiChannelDto,
  UpdateAiFeatureRouteDto,
  UpdateAiModelDto,
  AiCallLogFilterDto,
  AiCallLogStatsDto,
} from './dto'
import { AiCallLogService } from './ai-call-log.service'

const Permissions = definePermission('system:ai', [
  'read',
  'create',
  'update',
  'delete',
  'test',
] as const)
const CallLogPermissions = definePermission('monitor:aiCallLog', ['read'] as const)

@ApiTags('系统-AI 能力中心')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly channelService: AiChannelService,
    private readonly modelService: AiModelService,
    private readonly routeService: AiFeatureRouteService,
    private readonly callLogService: AiCallLogService,
  ) {}

  @Get('channels')
  @ApiOperation({ summary: '查询 AI 渠道' })
  @Permission(Permissions.READ)
  listChannels() {
    return this.channelService.list()
  }

  @Post('channels')
  @ApiOperation({ summary: '创建 AI 渠道' })
  @Permission(Permissions.CREATE)
  createChannel(@Body() dto: CreateAiChannelDto) {
    return this.channelService.create({
      ...dto,
      maxConcurrency: dto.maxConcurrency ?? 1,
      maxQueuedRequests: dto.maxQueuedRequests ?? 20,
      timeoutMs: dto.timeoutMs ?? 60_000,
    })
  }

  @Put('channels/:id')
  @ApiOperation({ summary: '修改 AI 渠道' })
  @Permission(Permissions.UPDATE)
  updateChannel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAiChannelDto) {
    return this.channelService.update(id, dto)
  }

  @Put('channels/:id/credential')
  @ApiOperation({ summary: '轮换 AI 渠道凭据' })
  @Permission(Permissions.UPDATE)
  rotateChannelCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateAiChannelCredentialDto,
  ) {
    return this.channelService.rotateCredential(id, dto.apiKey)
  }

  @Post('channels/:id/test')
  @ApiOperation({ summary: '测试 AI 渠道连接' })
  @Permission(Permissions.TEST)
  testChannel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TestAiChannelDto) {
    return this.channelService.test(id, dto.modelId, dto.capability)
  }

  @Post('channels/:id/enable')
  @ApiOperation({ summary: '启用 AI 渠道' })
  @Permission(Permissions.UPDATE)
  enableChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.enable(id)
  }

  @Post('channels/:id/disable')
  @ApiOperation({ summary: '停用 AI 渠道' })
  @Permission(Permissions.UPDATE)
  disableChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.disable(id)
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: '删除 AI 渠道' })
  @Permission(Permissions.DELETE)
  removeChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.remove(id)
  }

  @Get('models')
  @ApiOperation({ summary: '查询 AI 模型' })
  @Permission(Permissions.READ)
  listModels() {
    return this.modelService.list()
  }

  @Post('models')
  @ApiOperation({ summary: '创建 AI 模型' })
  @Permission(Permissions.CREATE)
  createModel(@Body() dto: CreateAiModelDto) {
    return this.modelService.create({ ...dto, enabled: dto.enabled ?? false })
  }

  @Put('models/:id')
  @ApiOperation({ summary: '修改 AI 模型' })
  @Permission(Permissions.UPDATE)
  updateModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAiModelDto) {
    return this.modelService.update(id, dto)
  }

  @Delete('models/:id')
  @ApiOperation({ summary: '删除 AI 模型' })
  @Permission(Permissions.DELETE)
  removeModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelService.remove(id)
  }

  @Get('feature-routes')
  @ApiOperation({ summary: '查询 AI 功能路由' })
  @Permission(Permissions.READ)
  listFeatureRoutes(@Query() query: AiFeatureRouteFilterDto) {
    return this.routeService.list(query.featureCode)
  }

  @Post('feature-routes')
  @ApiOperation({ summary: '创建 AI 功能路由' })
  @Permission(Permissions.CREATE)
  createFeatureRoute(@Body() dto: CreateAiFeatureRouteDto) {
    return this.routeService.create({ ...dto, enabled: dto.enabled ?? true })
  }

  @Put('feature-routes/:id')
  @ApiOperation({ summary: '修改 AI 功能路由' })
  @Permission(Permissions.UPDATE)
  updateFeatureRoute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAiFeatureRouteDto) {
    return this.routeService.update(id, dto)
  }

  @Delete('feature-routes/:id')
  @ApiOperation({ summary: '删除 AI 功能路由' })
  @Permission(Permissions.DELETE)
  removeFeatureRoute(@Param('id', ParseUUIDPipe) id: string) {
    return this.routeService.remove(id)
  }

  @Get('call-logs/filter')
  @ApiOperation({ summary: '查询 AI 能力调用日志' })
  @Permission(CallLogPermissions.READ)
  filterCallLogs(@Query() query: AiCallLogFilterDto) {
    return this.callLogService.filter(query)
  }

  @Get('call-logs/stats')
  @ApiOperation({ summary: '统计 AI 能力调用次数' })
  @Permission(CallLogPermissions.READ)
  statsCallLogs(@Query() query: AiCallLogStatsDto) {
    return this.callLogService.stats(query)
  }
}
