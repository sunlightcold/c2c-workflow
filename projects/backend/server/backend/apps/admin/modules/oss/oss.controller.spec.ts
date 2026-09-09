jest.mock('@admin/database', () => ({
  SysStorageBindingEntity: class SysStorageBindingEntity {},
  SysStorageChannelEntity: class SysStorageChannelEntity {},
}))
jest.mock('@/common/decorators', () => ({
  RateLimit: () => () => undefined,
}))
jest.mock('@/common/decorators/user.decorator', () => ({
  User: () => () => undefined,
}))

import type { StorageService } from '@admin/modules/system/storage/storage.service'
import { OssController } from './oss.controller'

describe('OssController', () => {
  it('keeps the avatar upload contract while using the configured storage purpose', async () => {
    const storageService = {
      createPresignedPut: jest.fn().mockResolvedValue({
        channelId: 'channel-1',
        fileUrl: 'https://cdn.example.com/avatars/user-1.webp',
        maxSize: 200 * 1024,
        objectKey: 'avatars/user-1.webp',
        putUrl: 'https://s3.example.com/signed',
        requireHeaders: { 'Content-Type': 'image/webp' },
      }),
    }
    const controller = new OssController(storageService as unknown as StorageService)
    const user = { uid: 'user-1', username: 'user' }

    const result = await controller.getAvatarSignature(user)

    expect(storageService.createPresignedPut).toHaveBeenCalledWith('system.avatar', {
      contentType: 'image/webp',
      objectKey: 'user-1.webp',
    })
    expect(result).toEqual({
      fileKey: 'avatars/user-1.webp',
      fileUrl: expect.stringMatching(/^https:\/\/cdn\.example\.com\/avatars\/user-1\.webp\?t=\d+$/),
      maxSize: 200 * 1024,
      putUrl: 'https://s3.example.com/signed',
      requireHeaders: { 'Content-Type': 'image/webp' },
    })
  })
})
