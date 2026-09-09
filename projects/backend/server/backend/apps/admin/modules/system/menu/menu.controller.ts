import { ErrorEnum } from '@/common/constants'
import { definePermission, Permission, User } from '@/common/decorators'
import { AuthUser } from '@/common/interfaces'
import { CreatorPipe } from '@/common/pipes'
import { isSuperAdmin } from '@/common/utils'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { MenuCreateDto, MenuFilterDto, MenuListDto, MenuUpdateDto } from './dto'
import { MenuService } from './menu.service'

export const Permissions = definePermission('system:menu', [
  'create',
  'delete',
  'update',
  'read',
] as const)

@ApiTags('系统-菜单管理')
@ApiBearerAuth()
@Controller('menus')
export class MenuController {
  @Inject(MenuService) private readonly menuService: MenuService

  @Post()
  @ApiOperation({ summary: '新建菜单' })
  @ApiBody({ type: MenuCreateDto, description: '参数' })
  @Permission(Permissions.CREATE)
  async create(@Body(CreatorPipe) dto: MenuCreateDto) {
    await this.menuService.check(dto)
    return this.menuService.create(dto)
  }

  @Get()
  @ApiOperation({ summary: '条件查询菜单' })
  @ApiQuery({ type: MenuListDto, description: '参数' })
  @UseInterceptors()
  @Permission(Permissions.READ)
  findAll(@Query() query: MenuListDto) {
    return this.menuService.findAll(query)
  }

  @Get('filter')
  @ApiOperation({ summary: '分页查询菜单' })
  @ApiQuery({ type: MenuFilterDto, description: '参数' })
  @Permission(Permissions.READ)
  filter(@Query() query: MenuFilterDto) {
    return this.menuService.filter(query)
  }

  @Get('web')
  @ApiOperation({ summary: '查询用户前端菜单' })
  findFrontendMenus(@User() user: AuthUser) {
    if (isSuperAdmin(user)) {
      return this.menuService.findAllFrontendMenus()
    } else {
      return this.menuService.findFrontendMenus(user.uid)
    }
  }

  @Get(':id')
  @ApiOperation({ summary: '通过ID查询菜单' })
  @ApiParam({ name: 'id', description: '菜单ID', type: Number })
  @Permission(Permissions.READ)
  findOne(@Param('id', new ParseIntPipe()) id: number) {
    return this.menuService.findOne(id)
  }

  @Put(':id')
  @ApiOperation({ summary: '通过ID更新菜单' })
  @ApiParam({ name: 'id', description: '菜单ID', type: Number })
  @ApiBody({ type: MenuUpdateDto, description: '参数' })
  @Permission(Permissions.UPDATE)
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: MenuUpdateDto) {
    await this.menuService.check(dto)
    return this.menuService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '通过ID删除菜单' })
  @ApiParam({ name: 'id', description: '菜单ID', type: Number })
  @Permission(Permissions.DELETE)
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    if (await this.menuService.checkRoleByMenuId(id))
      throw new BadRequestException(ErrorEnum.NOT_REMOVE_MENU_LINK_ROLE)
    return this.menuService.remove(id)
  }
}
