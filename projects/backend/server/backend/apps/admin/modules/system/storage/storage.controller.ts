import { User } from '@/common/decorators/user.decorator'
import { AuthUser } from '@/common/interfaces'
import { definePermission, Permission } from '@/common/decorators'
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  BindStoragePurposeDto,
  CreateStorageChannelDto,
  RotateStorageChannelCredentialsDto,
  UpdateStorageChannelDto,
} from './dto'
import { StorageBindingService } from './storage-binding.service'
import { StorageChannelService } from './storage-channel.service'

const Permissions = definePermission('system:storage', [
  'read',
  'create',
  'update',
  'delete',
  'test',
  'bind',
] as const)

@ApiTags('系统-对象存储')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(
    private readonly channelService: StorageChannelService,
    private readonly bindingService: StorageBindingService,
  ) {}

  @Get('channels')
  @ApiOperation({ summary: '查询对象存储渠道' })
  @Permission(Permissions.READ)
  listChannels() {
    return this.channelService.list()
  }

  @Post('channels')
  @ApiOperation({ summary: '创建对象存储渠道' })
  @Permission(Permissions.CREATE)
  createChannel(@Body() dto: CreateStorageChannelDto) {
    return this.channelService.create({
      ...dto,
      forcePathStyle: dto.forcePathStyle ?? true,
      region: dto.region ?? 'auto',
    })
  }

  @Get('channels/:id')
  @ApiOperation({ summary: '查询对象存储渠道详情' })
  @Permission(Permissions.READ)
  getChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.get(id)
  }

  @Put('channels/:id')
  @ApiOperation({ summary: '修改对象存储渠道展示配置' })
  @Permission(Permissions.UPDATE)
  updateChannel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStorageChannelDto) {
    return this.channelService.update(id, dto)
  }

  @Put('channels/:id/credentials')
  @ApiOperation({ summary: '轮换对象存储渠道凭据' })
  @Permission(Permissions.UPDATE)
  rotateCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateStorageChannelCredentialsDto,
  ) {
    return this.channelService.rotateCredentials(id, dto)
  }

  @Post('channels/:id/test')
  @ApiOperation({ summary: '测试对象存储渠道连接' })
  @Permission(Permissions.TEST)
  testChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.test(id)
  }

  @Post('channels/:id/enable')
  @ApiOperation({ summary: '启用对象存储渠道' })
  @Permission(Permissions.UPDATE)
  enableChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.enable(id)
  }

  @Post('channels/:id/disable')
  @ApiOperation({ summary: '停用对象存储渠道' })
  @Permission(Permissions.UPDATE)
  disableChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.disable(id)
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: '删除对象存储渠道' })
  @Permission(Permissions.DELETE)
  removeChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.remove(id)
  }

  @Get('purposes')
  @ApiOperation({ summary: '查询存储用途和绑定' })
  @Permission(Permissions.READ)
  listPurposes() {
    return this.bindingService.listPurposes()
  }

  @Put('purposes/:purposeCode/binding')
  @ApiOperation({ summary: '绑定存储用途渠道' })
  @Permission(Permissions.BIND)
  bindPurpose(
    @Param('purposeCode') purposeCode: string,
    @Body() dto: BindStoragePurposeDto,
    @User() user: AuthUser,
  ) {
    return this.bindingService.bind(
      purposeCode,
      dto.channelId,
      user.uid,
      dto.keyPrefixOverride ?? null,
    )
  }
}
