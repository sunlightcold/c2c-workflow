import { User } from '@/common/decorators/user.decorator'
import { AuthUser } from '@/common/interfaces'
import { SYSTEM_AVATAR_STORAGE_PURPOSE } from '@admin/modules/system/storage/storage-purpose.registry'
import { StorageService } from '@admin/modules/system/storage/storage.service'
import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RateLimit } from '@/common/decorators'

@ApiTags('OSS管理')
@ApiBearerAuth()
@Controller('oss')
export class OssController {
  constructor(private readonly storageService: StorageService) {}

  @Get('upload-signature/avatar')
  @ApiOperation({ summary: '获取头像上传签名' })
  @RateLimit({
    action: 'avatar_update',
    limit: 5,
    window: 'MONTH',
    errorMessage: '本月修改头像次数已达上限 (5次)，请下个月再试。',
  })
  async getAvatarSignature(@User() user: AuthUser<string>) {
    const signature = await this.storageService.createPresignedPut(SYSTEM_AVATAR_STORAGE_PURPOSE, {
      contentType: 'image/webp',
      objectKey: `${user.uid}.webp`,
    })
    return {
      fileKey: signature.objectKey,
      fileUrl: `${signature.fileUrl}?t=${Date.now()}`,
      maxSize: signature.maxSize,
      putUrl: signature.putUrl,
      requireHeaders: signature.requireHeaders,
    }
  }
}
