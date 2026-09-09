import { definePermission, Permission } from '@/common/decorators'
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
import { ParamsCreateDto, ParamsFilterDto, ParamsUpdateDto } from './dto'
import { ParamsService } from './params.service'

const Permissions = definePermission('system:params', [
  'read',
  'delete',
  'create',
  'update',
] as const)

@ApiTags('系统-系统参数')
@ApiBearerAuth()
@Controller('params')
export class ParamsController {
  @Inject(ParamsService) private readonly paramsService: ParamsService

  @Post()
  @ApiOperation({ summary: '新建参数' })
  @ApiBody({ type: ParamsCreateDto, description: '参数' })
  @Permission(Permissions.CREATE)
  create(@Body(CreatorPipe) dto: ParamsCreateDto) {
    return this.paramsService.create(dto)
  }

  @Put(':id')
  @ApiOperation({ summary: '更新参数' })
  @ApiParam({ name: 'id', description: 'ID', type: Number })
  @ApiBody({ type: ParamsUpdateDto, description: '参数' })
  @Permission(Permissions.UPDATE)
  update(@Param('id', new ParseIntPipe()) id: number, @Body(UpdaterPipe) dto: ParamsUpdateDto) {
    return this.paramsService.update(id, dto)
  }

  @Get('filter')
  @ApiOperation({ summary: '分页查询参数' })
  @ApiQuery({ type: ParamsFilterDto, description: '参数' })
  @Permission(Permissions.READ)
  filter(@Query() query: ParamsFilterDto) {
    return this.paramsService.filter(query)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除参数' })
  @ApiParam({ name: 'id', description: 'ID', type: Number })
  @Permission(Permissions.DELETE)
  async delete(@Param('id', new ParseIntPipe()) id: number) {
    await this.paramsService.checkSystemParams(id)
    return this.paramsService.delete(id)
  }
}
