import { definePermission, Permission, User } from '@/common/decorators'
import { CreatorPipe, UpdaterPipe, ValidateFilePipe } from '@/common/pipes'
import { getConfig, ValidationMatch } from '@/common/utils'
import { SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE } from '@admin/modules/system/storage/storage-purpose.registry'
import { StorageService } from '@admin/modules/system/storage/storage.service'
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { randomUUID } from 'crypto'
import { CreateTutorialDto, TutorialFilterDto, UpdateTutorialDto } from './tutorial.dto'
import { TutorialService } from './tutorial.service'

const TutorialPermissions = definePermission('system:tutorial', [
  'read',
  'create',
  'update',
  'delete',
  'publish',
  'upload',
] as const)
const MAX_FILE_SIZE = getConfig('admin').maxFileSize

@ApiTags('幻彩拼豆教程')
@ApiBearerAuth()
@Controller('tutorials')
export class TutorialAdminController {
  constructor(
    private readonly tutorialService: TutorialService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @Permission(TutorialPermissions.READ)
  @ApiOperation({ summary: '查询教程' })
  filter(@Query() dto: TutorialFilterDto) {
    return this.tutorialService.filter(dto)
  }

  @Post()
  @Permission(TutorialPermissions.CREATE)
  @ApiOperation({ summary: '创建教程' })
  create(@Body(CreatorPipe) dto: CreateTutorialDto) {
    return this.tutorialService.create(dto)
  }

  @Post('images')
  @Permission(TutorialPermissions.UPLOAD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile(
      new ValidateFilePipe({ maxFileSize: MAX_FILE_SIZE, fileType: ValidationMatch.image.regExp }),
    )
    file: Express.Multer.File,
  ) {
    const uploaded = await this.storageService.put(SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE, {
      body: file.buffer,
      contentType: file.mimetype,
      objectKey: randomUUID(),
    })
    return { url: uploaded.fileUrl }
  }

  @Get(':id')
  @Permission(TutorialPermissions.READ)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tutorialService.getById(id)
  }

  @Put(':id')
  @Permission(TutorialPermissions.UPDATE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(UpdaterPipe) dto: UpdateTutorialDto) {
    return this.tutorialService.update(id, dto)
  }

  @Delete(':id')
  @Permission(TutorialPermissions.DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tutorialService.remove(id)
  }

  @Post(':id/publish')
  @Permission(TutorialPermissions.PUBLISH)
  publish(@Param('id', ParseUUIDPipe) id: string, @User('uid') userId: number) {
    return this.tutorialService.publish(id, userId)
  }

  @Post(':id/unpublish')
  @Permission(TutorialPermissions.PUBLISH)
  unpublish(@Param('id', ParseUUIDPipe) id: string, @User('uid') userId: number) {
    return this.tutorialService.unpublish(id, userId)
  }
}
