import { definePermission, Permission, Public } from '@/common/decorators'
import { SkipLog } from '@/apps/admin/interceptors/skip-log.decorator'
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ClientErrorService } from './client-error.service'
import { ClientErrorCreateDto, ClientErrorFilterDto } from './dto'

const Permissions = definePermission('monitor:clientError', ['read', 'delete'] as const)

@ApiTags('客户端错误')
@Controller('client-errors')
@Public()
@SkipLog()
export class ClientErrorIngestController {
  constructor(private readonly service: ClientErrorService) {}

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '上报客户端错误' })
  create(
    @Body() dto: ClientErrorCreateDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.create(dto, { ip, userAgent })
  }
}

@ApiTags('系统-客户端错误')
@ApiBearerAuth()
@Controller('sys/client-errors')
export class ClientErrorAdminController {
  constructor(private readonly service: ClientErrorService) {}

  @Get()
  @Permission(Permissions.READ)
  @ApiOperation({ summary: '客户端错误-分页查询' })
  filter(@Query() query: ClientErrorFilterDto) {
    return this.service.filter(query)
  }

  @Get(':eventId')
  @Permission(Permissions.READ)
  @ApiOperation({ summary: '客户端错误-详情' })
  findOne(@Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string) {
    return this.service.findOne(eventId)
  }

  @Delete(':eventId')
  @Permission(Permissions.DELETE)
  @ApiOperation({ summary: '客户端错误-删除' })
  remove(@Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string) {
    return this.service.remove(eventId)
  }
}
