import { definePermission, Permission, User } from '@/common/decorators'
import { BusinessStatus } from '@admin/database'
import type { AuthUser } from '@/common/interfaces'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { BusinessScopeService } from '../business'
import { TelegramBotService } from './telegram-bot.service'
import {
  ApproveTelegramGroupDto,
  CreateTelegramBotDto,
  CreateTelegramGroupDto,
  CreateTelegramMemberDto,
  CreateTelegramSuperAdminDto,
  SetTelegramStatusDto,
  TelegramBotRuntimeStatusDto,
  TelegramBotListDto,
  TelegramEligibleUserDto,
  TelegramGroupListDto,
  TelegramMemberListDto,
  TelegramSuperAdminListDto,
  TelegramTenantContextDto,
  UpdateTelegramBotDto,
  UpdateTelegramGroupDto,
  UpdateTelegramMemberDto,
  UpdateTelegramSuperAdminDto,
} from './telegram.dto'
import { TelegramGroupService } from './telegram-group.service'
import { TelegramMemberService } from './telegram-member.service'
import { getTelegramCapabilityPolicy } from './telegram-policy'
import { TelegramSuperAdminService } from './telegram-super-admin.service'
import { TelegramUserDirectoryService } from './telegram-user-directory.service'
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service'

const BotPermissions = definePermission('telegram:bot', [
  'read',
  'create',
  'update',
  'delete',
] as const)
const GroupPermissions = definePermission('telegram:group', [
  'read',
  'create',
  'update',
  'approve',
  'unbind',
] as const)
const MemberPermissions = definePermission('telegram:member', [
  'read',
  'create',
  'update',
  'delete',
] as const)
const SuperAdminPermissions = definePermission('telegram:superAdmin', [
  'read',
  'create',
  'update',
  'delete',
] as const)

@ApiTags('C2C-Telegram 支付机器人')
@ApiBearerAuth()
@Controller()
export class TelegramController {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly bots: TelegramBotService,
    private readonly groups: TelegramGroupService,
    private readonly members: TelegramMemberService,
    private readonly superAdmins: TelegramSuperAdminService,
    private readonly userDirectory: TelegramUserDirectoryService,
    private readonly runtime: TelegramBotRuntimeService,
  ) {}

  @Get('capabilities')
  @Permission(BotPermissions.READ)
  @ApiOperation({ summary: '查询支付机器人能力与群成员角色策略' })
  capabilities() {
    return getTelegramCapabilityPolicy()
  }

  @Get('bots')
  @Permission(BotPermissions.READ)
  @ApiOperation({ summary: '分页查询机器人实例' })
  listBots(@Query() dto: TelegramBotListDto, @User() actor: AuthUser) {
    return this.bots.list(this.scope.resolveTenantId(actor, dto.tenantId), dto).then((result) => ({
      ...result,
      items: result.items.map((item) => {
        const runtime = this.runtime.getStatus(item.code)
        return {
          ...item,
          runtime:
            item.status === BusinessStatus.DISABLED && runtime.state === 'NOT_STARTED'
              ? { ...runtime, state: 'DISABLED', message: '机器人配置已停用' }
              : runtime,
        }
      }),
    }))
  }

  @Post('bots')
  @Permission(BotPermissions.CREATE)
  @ApiOperation({ summary: '创建支付机器人实例' })
  createBot(@Body() dto: CreateTelegramBotDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    const resolvedTenantId = this.scope.resolveTenantId(actor, tenantId)
    return this.bots.create(resolvedTenantId, input).then(async (result) => {
      await this.runtime.start(resolvedTenantId, result.id)
      return result
    })
  }

  @Put('bots/:id')
  @Permission(BotPermissions.UPDATE)
  @ApiOperation({ summary: '编辑支付机器人实例' })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  updateBot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTelegramBotDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    const resolvedTenantId = this.scope.resolveTenantId(actor, tenantId)
    return this.bots.update(resolvedTenantId, id, input).then(async (result) => {
      await this.runtime.reloadIfRunning(resolvedTenantId, id)
      return result
    })
  }

  @Patch('bots/:id/status')
  @Permission(BotPermissions.UPDATE)
  @ApiOperation({ summary: '启用或停用支付机器人实例' })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  setBotStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @Body() statusDto: SetTelegramStatusDto,
    @User() actor: AuthUser,
  ) {
    const resolvedTenantId = this.scope.resolveTenantId(actor, dto.tenantId)
    return this.bots.setStatus(resolvedTenantId, id, statusDto.status).then(async (result) => {
      if (statusDto.status === BusinessStatus.ACTIVE) await this.runtime.start(resolvedTenantId, id)
      else await this.runtime.stop(resolvedTenantId, id)
      return result
    })
  }

  @Delete('bots/:id')
  @Permission(BotPermissions.DELETE)
  @ApiOperation({ summary: '删除尚未产生群组记录的机器人实例' })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  async removeBot(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    const botCode = await this.bots.remove(this.scope.resolveTenantId(actor, dto.tenantId), id)
    await this.runtime.stopByCode(botCode)
  }

  @Post('bots/:id/runtime/start')
  @HttpCode(HttpStatus.OK)
  @Permission(BotPermissions.UPDATE)
  @ApiOperation({ summary: '启动支付机器人运行时' })
  @ApiOkResponse({ type: TelegramBotRuntimeStatusDto })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  startBotRuntime(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.runtime.start(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post('bots/:id/runtime/stop')
  @HttpCode(HttpStatus.OK)
  @Permission(BotPermissions.UPDATE)
  @ApiOperation({ summary: '停止支付机器人运行时' })
  @ApiOkResponse({ type: TelegramBotRuntimeStatusDto })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  stopBotRuntime(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.runtime.stop(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post('bots/:id/runtime/restart')
  @HttpCode(HttpStatus.OK)
  @Permission(BotPermissions.UPDATE)
  @ApiOperation({ summary: '重启支付机器人运行时' })
  @ApiOkResponse({ type: TelegramBotRuntimeStatusDto })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  restartBotRuntime(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.runtime.restart(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Post('bots/:id/runtime/check')
  @HttpCode(HttpStatus.OK)
  @Permission(BotPermissions.READ)
  @ApiOperation({ summary: '检测支付机器人 Telegram 连通性' })
  @ApiOkResponse({ type: TelegramBotRuntimeStatusDto })
  @ApiParam({ name: 'id', description: '机器人实例 ID', type: String })
  checkBotRuntime(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.runtime.check(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Get('groups')
  @Permission(GroupPermissions.READ)
  @ApiOperation({ summary: '分页查询 Telegram 群组绑定' })
  listGroups(@Query() dto: TelegramGroupListDto, @User() actor: AuthUser) {
    return this.groups.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Post('groups')
  @Permission(GroupPermissions.CREATE)
  @ApiOperation({ summary: '创建群组绑定挑战；验证码只在本次响应中返回' })
  createGroup(@Body() dto: CreateTelegramGroupDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.groups.createChallenge(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Put('groups/:id')
  @Permission(GroupPermissions.UPDATE)
  @ApiOperation({ summary: '编辑群组的机器人、商家、支付场景、能力和通知配置' })
  @ApiParam({ name: 'id', description: '群组绑定 ID', type: String })
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTelegramGroupDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.groups.update(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Post('groups/:id/approve')
  @Permission(GroupPermissions.APPROVE)
  @ApiOperation({ summary: '人工审批并绑定 Telegram 群组' })
  @ApiParam({ name: 'id', description: '群组绑定 ID', type: String })
  approveGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveTelegramGroupDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.groups.approve(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Delete('groups/:id')
  @Permission(GroupPermissions.UNBIND)
  @ApiOperation({ summary: '解绑群组并停用该群成员，历史记录保留' })
  @ApiParam({ name: 'id', description: '群组绑定 ID', type: String })
  unbindGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.groups.unbind(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Get('members')
  @Permission(MemberPermissions.READ)
  @ApiOperation({ summary: '分页查询 Telegram 群组成员' })
  listMembers(@Query() dto: TelegramMemberListDto, @User() actor: AuthUser) {
    return this.members.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get('members/eligible-users')
  @Permission(MemberPermissions.READ)
  @ApiOperation({ summary: '查询当前所属单位可绑定的后台用户' })
  @ApiOkResponse({ type: [TelegramEligibleUserDto] })
  listMemberEligibleUsers(@Query() dto: TelegramTenantContextDto, @User() actor: AuthUser) {
    return this.userDirectory.listEligible(this.scope.resolveTenantId(actor, dto.tenantId))
  }

  @Post('members')
  @Permission(MemberPermissions.CREATE)
  @ApiOperation({ summary: '新增群组成员并映射后台用户' })
  createMember(@Body() dto: CreateTelegramMemberDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.members.create(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Put('members/:id')
  @Permission(MemberPermissions.UPDATE)
  @ApiOperation({ summary: '编辑群组成员身份与权限' })
  @ApiParam({ name: 'id', description: '群组成员 ID', type: String })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTelegramMemberDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.members.update(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Patch('members/:id/status')
  @Permission(MemberPermissions.UPDATE)
  @ApiOperation({ summary: '启用或停用群组成员' })
  @ApiParam({ name: 'id', description: '群组成员 ID', type: String })
  setMemberStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @Body() statusDto: SetTelegramStatusDto,
    @User() actor: AuthUser,
  ) {
    return this.members.setStatus(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
      statusDto.status,
    )
  }

  @Delete('members/:id')
  @Permission(MemberPermissions.DELETE)
  @ApiOperation({ summary: '移除 Telegram 群组成员' })
  @ApiParam({ name: 'id', description: '群组成员 ID', type: String })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.members.remove(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }

  @Get('super-admins')
  @Permission(SuperAdminPermissions.READ)
  @ApiOperation({ summary: '分页查询本所属单位 Telegram 超级管理员' })
  listSuperAdmins(@Query() dto: TelegramSuperAdminListDto, @User() actor: AuthUser) {
    return this.superAdmins.list(this.scope.resolveTenantId(actor, dto.tenantId), dto)
  }

  @Get('super-admins/eligible-users')
  @Permission(SuperAdminPermissions.READ)
  @ApiOperation({ summary: '查询当前所属单位可设为超级管理员的后台用户' })
  @ApiOkResponse({ type: [TelegramEligibleUserDto] })
  listSuperAdminEligibleUsers(@Query() dto: TelegramTenantContextDto, @User() actor: AuthUser) {
    return this.userDirectory.listEligible(this.scope.resolveTenantId(actor, dto.tenantId))
  }

  @Post('super-admins')
  @Permission(SuperAdminPermissions.CREATE)
  @ApiOperation({ summary: '新增本所属单位 Telegram 超级管理员' })
  createSuperAdmin(@Body() dto: CreateTelegramSuperAdminDto, @User() actor: AuthUser) {
    const { tenantId, ...input } = dto
    return this.superAdmins.create(this.scope.resolveTenantId(actor, tenantId), input)
  }

  @Put('super-admins/:id')
  @Permission(SuperAdminPermissions.UPDATE)
  @ApiOperation({ summary: '编辑 Telegram 超级管理员身份与群组范围' })
  @ApiParam({ name: 'id', description: 'Telegram 超级管理员 ID', type: String })
  updateSuperAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTelegramSuperAdminDto,
    @User() actor: AuthUser,
  ) {
    const { tenantId, ...input } = dto
    return this.superAdmins.update(this.scope.resolveTenantId(actor, tenantId), id, input)
  }

  @Patch('super-admins/:id/status')
  @Permission(SuperAdminPermissions.UPDATE)
  @ApiOperation({ summary: '启用或停用 Telegram 超级管理员' })
  @ApiParam({ name: 'id', description: 'Telegram 超级管理员 ID', type: String })
  setSuperAdminStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @Body() statusDto: SetTelegramStatusDto,
    @User() actor: AuthUser,
  ) {
    return this.superAdmins.setStatus(
      this.scope.resolveTenantId(actor, dto.tenantId),
      id,
      statusDto.status,
    )
  }

  @Delete('super-admins/:id')
  @Permission(SuperAdminPermissions.DELETE)
  @ApiOperation({ summary: '移除 Telegram 超级管理员' })
  @ApiParam({ name: 'id', description: 'Telegram 超级管理员 ID', type: String })
  removeSuperAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: TelegramTenantContextDto,
    @User() actor: AuthUser,
  ) {
    return this.superAdmins.remove(this.scope.resolveTenantId(actor, dto.tenantId), id)
  }
}
