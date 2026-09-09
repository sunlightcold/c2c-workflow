jest.mock('@admin/database', () => ({
  SysStorageBindingEntity: class SysStorageBindingEntity {},
  SysStorageChannelStatus: { ACTIVE: 'active' },
}))
jest.mock('./storage-channel.service', () => ({
  StorageChannelService: class StorageChannelService {},
}))

import { SysStorageBindingEntity, SysStorageChannelStatus } from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { StorageChannelService } from './storage-channel.service'
import { StoragePurposeRegistry } from './storage-purpose.registry'
import { StorageService } from './storage.service'
import { S3_OBJECT_GATEWAY } from './storage.types'

describe('StorageService', () => {
  const target = {
    accessKeyId: 'access-key',
    bucket: 'assets',
    channel: {
      id: '00000000-0000-4000-8000-000000000001',
      credentialVersion: 1,
      publicBaseUrl: 'https://cdn.example.com',
      status: SysStorageChannelStatus.ACTIVE,
    },
    endpoint: 'https://s3.example.com',
    forcePathStyle: true,
    region: 'auto',
    secretAccessKey: 'secret-key',
  }
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue({ channelId: target.channel.id }),
  }
  const channelService = { resolve: jest.fn().mockResolvedValue(target) }
  const gateway = {
    put: jest.fn().mockResolvedValue(undefined),
    createPresignedPut: jest.fn().mockResolvedValue('https://s3.example.com/signed'),
  }
  let service: StorageService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        StorageService,
        StoragePurposeRegistry,
        { provide: getRepositoryToken(SysStorageBindingEntity), useValue: bindingRepository },
        { provide: StorageChannelService, useValue: channelService },
        { provide: S3_OBJECT_GATEWAY, useValue: gateway },
      ],
    }).compile()
    service = module.get(StorageService)
  })

  it('routes a public object through its purpose binding', async () => {
    await expect(
      service.put('system.avatar', {
        body: Buffer.from('avatar'),
        contentType: 'image/webp',
        objectKey: 'avatars/user.webp',
      }),
    ).resolves.toEqual({
      channelId: target.channel.id,
      objectKey: 'avatars/user.webp',
      fileUrl: 'https://cdn.example.com/avatars/user.webp',
    })
    expect(gateway.put).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ objectKey: 'avatars/user.webp' }),
    )
  })

  it('rejects an object key containing path traversal', async () => {
    await expect(
      service.put('system.avatar', {
        body: Buffer.from('avatar'),
        contentType: 'image/webp',
        objectKey: '../user.webp',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(gateway.put).not.toHaveBeenCalled()
  })

  it('returns the configured size limit with a presigned upload', async () => {
    await expect(
      service.createPresignedPut('system.avatar', {
        contentType: 'image/webp',
        objectKey: 'avatars/user.webp',
      }),
    ).resolves.toMatchObject({
      channelId: target.channel.id,
      maxSize: 200 * 1024,
      putUrl: 'https://s3.example.com/signed',
    })
  })

  it('replaces the registered prefix when a binding override is configured', async () => {
    bindingRepository.findOne.mockResolvedValue({
      channelId: target.channel.id,
      keyPrefixOverride: 'profile-images/',
    })

    await expect(
      service.createPresignedPut('system.avatar', {
        contentType: 'image/webp',
        objectKey: 'avatars/user.webp',
      }),
    ).resolves.toMatchObject({
      objectKey: 'profile-images/user.webp',
    })
    expect(gateway.createPresignedPut).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ objectKey: 'profile-images/user.webp' }),
    )
  })
})
