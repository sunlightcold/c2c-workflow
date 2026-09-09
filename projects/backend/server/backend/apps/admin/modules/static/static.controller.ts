import { definePermission, Permission, User } from '@/common/decorators'
import { AuthUser } from '@/common/interfaces'
import { ValidateFilePipe } from '@/common/pipes'
import { getConfig, ValidationMatch } from '@/common/utils'
import { SysFileAccessEnum, SysStaticTypeEnum } from '@admin/database'
import { SkipLog } from '@admin/interceptors/skip-log.decorator'
import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { FilterUserFileDto } from './static.dto'
import { StaticService } from './static.service'

const Permissions = definePermission('system:static', ['read', 'upload_image', 'delete'] as const)

const MAX_FILE_SIZE = getConfig('admin').maxFileSize

@ApiTags('系统-静态文件模块')
@ApiBearerAuth()
@Controller('static')
export class StaticController {
  constructor(private readonly staticService: StaticService) {}

  @Get('filter')
  @ApiOperation({ summary: '分页查询用户静态文件' })
  @Permission(Permissions.READ)
  filter(@Query() query: FilterUserFileDto) {
    return this.staticService.filter(query)
  }

  @Post('upload/image')
  @SkipLog()
  @ApiOperation({ summary: '上传图片' })
  @UseInterceptors(FileInterceptor('file'))
  @Permission(Permissions.UPLOAD_IMAGE)
  upload(
    @UploadedFile(
      new ValidateFilePipe({ maxFileSize: MAX_FILE_SIZE, fileType: ValidationMatch.image.regExp }),
    )
    file: Express.Multer.File,
    @User() user: AuthUser,
  ) {
    return this.staticService.uploadFile({
      file,
      uid: user.uid,
      type: SysStaticTypeEnum.IMAGE,
      access: SysFileAccessEnum.PUBLIC,
    })
  }

  @Delete('path/:path')
  @ApiOperation({ summary: '通过路径删除文件' })
  @ApiParam({ name: 'path', type: String })
  @Permission(Permissions.DELETE)
  deleteByPath(@Param('path') path: string) {
    return this.staticService.deleteByPath(decodeURIComponent(path))
  }

  @Delete(':id')
  @ApiOperation({ summary: '通过用户文件ID删除文件' })
  @ApiParam({ name: 'id', type: Number })
  @Permission(Permissions.DELETE)
  delete(@Param('id', new ParseIntPipe()) id: number) {
    return this.staticService.delete(id)
  }
}
