import { SysUserEntity } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { definePermission, Permission, User } from '@/common/decorators'
import { CheckExists } from '@/common/interceptors'
import { AuthUser } from '@/common/interfaces'
import { CreatorPipe, UpdaterPipe } from '@/common/pipes'
import {
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
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserCreateDto, UserFilterDto, UserUpdateDto } from './user.dto'
import { UserService } from './user.service'

const Permissions = definePermission('system:user', ['read', 'delete', 'update', 'create'] as const)

@ApiTags('系统-用户管理')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  @Inject(UserService) private userService: UserService

  @Post()
  @ApiOperation({ summary: '新建系统用户' })
  @ApiBody({ description: '参数', type: UserCreateDto })
  @CheckExists(SysUserEntity, 'username', { message: ErrorEnum.UN_UNIQUE_USERNAME })
  @Permission(Permissions.CREATE)
  create(@Body(CreatorPipe) dto: UserCreateDto) {
    return this.userService.create(dto)
  }

  @Permission(Permissions.READ)
  @ApiOperation({ summary: '分页查询系统用户' })
  @ApiQuery({ description: '参数', type: UserFilterDto })
  @Get('filter')
  filter(@Query() query: UserFilterDto) {
    return this.userService.filter(query)
  }

  @Get('info')
  @ApiOperation({ summary: '根据token查询用户信息' })
  info(@User() user: AuthUser) {
    return this.userService.getInfo(user.uid)
  }

  @Put(':id')
  @ApiOperation({ summary: '通过ID更新系统用户' })
  @ApiBody({ description: '参数', type: UserUpdateDto })
  @ApiParam({ name: 'id', description: '用户ID' })
  @Permission(Permissions.UPDATE)
  update(@Param('id', new ParseIntPipe()) id: number, @Body(UpdaterPipe) dto: UserUpdateDto) {
    return this.userService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '通过ID删除系统用户' })
  @Permission(Permissions.DELETE)
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.userService.checkAdminUserDelete(id)
    return this.userService.remove(id)
  }
}
