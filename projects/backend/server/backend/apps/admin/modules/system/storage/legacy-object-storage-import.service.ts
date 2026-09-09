import { SysStorageChannelProvider, SysStorageChannelStatus } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { StorageBindingService } from './storage-binding.service'
import { StorageChannelService } from './storage-channel.service'
import { PLATFORM_DEFAULT_STORAGE_PURPOSES } from './storage-purpose.registry'

export const PLATFORM_DEFAULT_STORAGE_CHANNEL = 'platform-default'

export interface LegacyObjectStorageConfig {
  accessKeyId: string
  bucket: string
  domain: string
  endpoint: string
  region: string
  secretAccessKey: string
}

@Injectable()
export class LegacyObjectStorageImportService {
  constructor(
    private readonly channelService: StorageChannelService,
    private readonly bindingService: StorageBindingService,
  ) {}

  async import(config: LegacyObjectStorageConfig): Promise<void> {
    let channel = await this.channelService.findByCode(PLATFORM_DEFAULT_STORAGE_CHANNEL)
    if (!channel) {
      channel = await this.channelService.create({
        accessKeyId: config.accessKeyId,
        bucket: config.bucket,
        code: PLATFORM_DEFAULT_STORAGE_CHANNEL,
        endpoint: config.endpoint,
        forcePathStyle: true,
        name: '平台默认存储',
        provider: SysStorageChannelProvider.S3_COMPATIBLE,
        publicBaseUrl: config.domain,
        region: config.region,
        secretAccessKey: config.secretAccessKey,
      })
    }
    if (channel.status !== SysStorageChannelStatus.ACTIVE) {
      channel = await this.channelService.enable(channel.id)
    }
    const existingBindings = new Map(
      (await this.bindingService.listPurposes()).map((purpose) => [purpose.code, purpose]),
    )
    for (const purposeCode of PLATFORM_DEFAULT_STORAGE_PURPOSES) {
      const existingBinding = existingBindings.get(purposeCode)
      if (existingBinding?.bindingChannelId === channel.id) continue
      if (existingBinding?.bindingChannelId) {
        throw new Error(`Storage purpose is already bound to another channel: ${purposeCode}`)
      }
      await this.bindingService.bind(purposeCode, channel.id, null)
    }
  }
}
