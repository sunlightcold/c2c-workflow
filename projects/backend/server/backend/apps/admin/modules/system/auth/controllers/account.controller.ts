import { definePermission, Permission, User } from '@/common/decorators'
import { AuthUser } from '@/common/interfaces'
import { ValidateFilePipe } from '@/common/pipes'
import { ValidationMatch } from '@/common/utils'
import { SkipLog } from '@admin/interceptors/skip-log.decorator'
import { Body, Controller, Inject, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AccountUpdateDto } from '../dto'
import { AccountService } from '../services'

const Permissions = definePermission('sys:account', ['avatar', 'update'] as const)

@ApiTags('认证-账户管理')
@Controller('auth/account')
export class AccountController {
  @Inject(AccountService) private readonly accountService: AccountService

  @Post('avatar')
  @SkipLog()
  @ApiOperation({ summary: '上传用户头像' })
  @UseInterceptors(FileInterceptor('file'))
  @Permission(Permissions.AVATAR)
  upload(
    @UploadedFile(
      new ValidateFilePipe({
        maxFileSize: 1024 * 1024 * 3,
        fileType: ValidationMatch.image.regExp,
      }),
    )
    file: Express.Multer.File,
    @User() user: AuthUser,
  ) {
    return this.accountService.uploadAvatar(user.uid, file)
  }

  @Put()
  @ApiOperation({ summary: '更新基本信息' })
  @ApiBody({ description: '参数', type: AccountUpdateDto })
  @Permission(Permissions.UPDATE)
  updateInfo(@Body() body: AccountUpdateDto, @User() user: AuthUser) {
    return this.accountService.updateInfo(user.uid, body)
  }
}
