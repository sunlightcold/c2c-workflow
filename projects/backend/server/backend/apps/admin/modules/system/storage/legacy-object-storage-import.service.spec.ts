jest.mock('@admin/database', () => ({
  SysStorageChannelProvider: { S3_COMPATIBLE: 's3_compatible' },
  SysStorageChannelStatus: { ACTIVE: 'active', DISABLED: 'disabled' },
}))
jest.mock('./storage-binding.service', () => ({
  StorageBindingService: class StorageBindingService {},
}))
jest.mock('./storage-channel.service', () => ({
  StorageChannelService: class StorageChannelService {},
}))

import { SysStorageChannelProvider, SysStorageChannelStatus } from '@admin/database'
import { LegacyObjectStorageImportService } from './legacy-object-storage-import.service'
import type { StorageBindingService } from './storage-binding.service'
import type { StorageChannelService } from './storage-channel.service'

describe('LegacyObjectStorageImportService', () => {
  const channelService = {
    create: jest.fn(),
    enable: jest.fn(),
    findByCode: jest.fn(),
  }
  const bindingService = {
    bind: jest.fn(),
    listPurposes: jest.fn(),
  }
  const service = new LegacyObjectStorageImportService(
    channelService as unknown as StorageChannelService,
    bindingService as unknown as StorageBindingService,
  )
  const legacyConfig = {
    accessKeyId: 'legacy-access-key',
    bucket: 'legacy-bucket',
    domain: 'https://cdn.example.com',
    endpoint: 'https://s3.example.com',
    region: 'auto',
    secretAccessKey: 'legacy-secret-key',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    bindingService.listPurposes.mockResolvedValue([])
  })

  it('creates and activates the platform default channel before binding platform purposes', async () => {
    channelService.findByCode.mockResolvedValue(null)
    channelService.create.mockResolvedValue({
      id: 'channel-1',
      status: SysStorageChannelStatus.DISABLED,
    })
    channelService.enable.mockResolvedValue({
      id: 'channel-1',
      status: SysStorageChannelStatus.ACTIVE,
    })

    await service.import(legacyConfig)

    expect(channelService.create).toHaveBeenCalledWith({
      accessKeyId: 'legacy-access-key',
      bucket: 'legacy-bucket',
      code: 'platform-default',
      endpoint: 'https://s3.example.com',
      forcePathStyle: true,
      name: '平台默认存储',
      provider: SysStorageChannelProvider.S3_COMPATIBLE,
      publicBaseUrl: 'https://cdn.example.com',
      region: 'auto',
      secretAccessKey: 'legacy-secret-key',
    })
    expect(channelService.enable).toHaveBeenCalledWith('channel-1')
    expect(bindingService.bind).toHaveBeenNthCalledWith(1, 'system.avatar', 'channel-1', null)
    expect(bindingService.bind).toHaveBeenNthCalledWith(
      2,
      'system.tutorial-content',
      'channel-1',
      null,
    )
  })

  it('reuses an active platform default channel when the import is repeated', async () => {
    channelService.findByCode.mockResolvedValue({
      id: 'channel-1',
      status: SysStorageChannelStatus.ACTIVE,
    })
    bindingService.listPurposes.mockResolvedValue([
      { bindingChannelId: 'channel-1', code: 'system.avatar' },
      { bindingChannelId: 'channel-1', code: 'system.tutorial-content' },
    ])

    await service.import(legacyConfig)

    expect(channelService.create).not.toHaveBeenCalled()
    expect(channelService.enable).not.toHaveBeenCalled()
    expect(bindingService.bind).not.toHaveBeenCalled()
  })

  it('does not replace an existing platform binding to another channel', async () => {
    channelService.findByCode.mockResolvedValue({
      id: 'channel-1',
      status: SysStorageChannelStatus.ACTIVE,
    })
    bindingService.listPurposes.mockResolvedValue([
      { bindingChannelId: 'channel-1', code: 'system.avatar' },
      { bindingChannelId: 'channel-2', code: 'system.tutorial-content' },
    ])

    await expect(service.import(legacyConfig)).rejects.toThrow(
      'Storage purpose is already bound to another channel: system.tutorial-content',
    )
    expect(bindingService.bind).not.toHaveBeenCalled()
  })
})
