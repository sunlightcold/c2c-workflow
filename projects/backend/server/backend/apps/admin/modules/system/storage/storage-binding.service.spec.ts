jest.mock('@admin/database', () => ({
  SysStorageBindingEntity: class SysStorageBindingEntity {},
  SysStorageChannelStatus: { ACTIVE: 'active' },
}))
jest.mock('./storage-channel.service', () => ({
  StorageChannelService: class StorageChannelService {},
}))

import { SysStorageBindingEntity } from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { StorageChannelService } from './storage-channel.service'
import { StorageBindingService } from './storage-binding.service'
import { StoragePurposeRegistry } from './storage-purpose.registry'

describe('StorageBindingService', () => {
  const bindingRepository = {
    create: jest.fn((value) => value),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
  }
  const channelService = {
    resolve: jest.fn(),
  }
  let service: StorageBindingService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        StorageBindingService,
        StoragePurposeRegistry,
        { provide: getRepositoryToken(SysStorageBindingEntity), useValue: bindingRepository },
        { provide: StorageChannelService, useValue: channelService },
      ],
    }).compile()
    service = module.get(StorageBindingService)
  })

  it('rejects a public purpose when the active channel has no public base URL', async () => {
    channelService.resolve.mockResolvedValue({
      channel: { id: 'channel-1', publicBaseUrl: null, status: 'active' },
    })
    await expect(service.bind('system.avatar', 'channel-1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(bindingRepository.save).not.toHaveBeenCalled()
  })

  it('persists a normalized prefix override with the channel binding', async () => {
    channelService.resolve.mockResolvedValue({
      channel: {
        id: 'channel-1',
        publicBaseUrl: 'https://cdn.example.com',
        status: 'active',
      },
    })
    bindingRepository.find.mockResolvedValue([])

    await service.bind('system.avatar', 'channel-1', 7, 'profile-images/')

    expect(bindingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        keyPrefixOverride: 'profile-images/',
        purposeCode: 'system.avatar',
        updatedBy: 7,
      }),
    )
  })

  it('rejects overlapping prefixes on the same channel', async () => {
    channelService.resolve.mockResolvedValue({
      channel: {
        id: 'channel-1',
        publicBaseUrl: 'https://cdn.example.com',
        status: 'active',
      },
    })
    bindingRepository.find.mockResolvedValue([
      { channelId: 'channel-1', keyPrefixOverride: 'avatars/public/', purposeCode: 'app.media' },
    ])
    const registry = (service as unknown as { purposeRegistry: StoragePurposeRegistry })
      .purposeRegistry
    registry.register({
      allowedMimeTypes: ['image/webp'],
      code: 'app.media',
      group: 'app',
      keyPrefix: 'media/',
      maxSizeBytes: 1024,
      visibility: 'public',
    })

    await expect(service.bind('system.avatar', 'channel-1', 1, 'avatars/')).rejects.toThrow(
      'Storage key prefix overlaps with purpose: app.media',
    )
    expect(bindingRepository.save).not.toHaveBeenCalled()
  })
})
