import { SysRoleEntity } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { definePermission, Permission } from '@/common/decorators'
import { CheckExists } from '@/common/interceptors'
import { CreatorPipe, UpdaterPipe } from '@/common/pipes'
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { RoleCreateDto, RoleFilterDto, RoleListDto, RoleUpdateDto } from './role.dto'
import { RoleService } from './role.service'

const Permissions = definePermission('system:role', ['read', 'delete', 'update', 'create'] as const)

@ApiTags('系统-角色管理')
@ApiBearerAuth()
@Controller('roles')
export class RoleController {
  @Inject(RoleService) private readonly roleService: RoleService

  @Post()
  @ApiOperation({ summary: '新建角色' })
  @ApiBody({ type: RoleCreateDto })
  @CheckExists(SysRoleEntity, 'value', { message: ErrorEnum.ROLE_NOT_UNIQUE })
  @Permission(Permissions.CREATE)
  async create(@Body(CreatorPipe) role: RoleCreateDto) {
    return this.roleService.create(role)
  }

  @Get('filter')
  @ApiOperation({ summary: '分页查询角色' })
  @ApiQuery({ type: RoleFilterDto })
  @Permission(Permissions.READ)
  filter(@Query() query: RoleFilterDto) {
    return this.roleService.filter(query)
  }

  @Get()
  @ApiOperation({ summary: '条件查询角色' })
  @ApiQuery({ type: RoleListDto, description: '参数' })
  @Permission(Permissions.READ)
  findAll(@Query() query: RoleListDto) {
    return this.roleService.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: '根据ID查询角色' })
  @ApiParam({ name: 'id', type: Number })
  @Permission(Permissions.READ)
  async findOne(@Param('id', new ParseIntPipe()) id: number) {
    return this.roleService.findOne(id)
  }

  @Put(':id')
  @ApiOperation({ summary: '根据ID更新角色' })
  @ApiParam({ name: 'id', type: Number })
  @Permission(Permissions.UPDATE)
  async update(
    @Param('id', new ParseIntPipe()) id: number,
    @Body(UpdaterPipe) updateData: RoleUpdateDto,
  ) {
    return this.roleService.update(id, updateData)
  }

  @Delete(':id')
  @ApiOperation({ summary: '根据ID删除角色' })
  @ApiParam({ name: 'id', type: Number })
  @Permission(Permissions.DELETE)
  async delete(@Param('id', new ParseArrayPipe({ items: Number, separator: ',' })) ids: number[]) {
    await this.roleService.checkUserByRoleIds(ids)
    return this.roleService.delete(ids)
  }
}
