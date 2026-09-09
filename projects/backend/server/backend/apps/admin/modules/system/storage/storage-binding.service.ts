import { SysStorageBindingEntity, SysStorageChannelStatus } from '@admin/database'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StorageChannelService } from './storage-channel.service'
import { StoragePurposeRegistry } from './storage-purpose.registry'
import { normalizeStorageKeyPrefix } from './storage.types'

export interface StoragePurposeView {
  allowedMimeTypes: readonly string[]
  bindingChannelId: string | null
  bindingChannelName: string | null
  code: string
  defaultKeyPrefix: string
  group: 'app' | 'system'
  keyPrefixOverride: string | null
  keyPrefix: string
  maxSizeBytes: number
  visibility: 'private' | 'public'
}

@Injectable()
export class StorageBindingService {
  constructor(
    @InjectRepository(SysStorageBindingEntity)
    private readonly bindingRepository: Repository<SysStorageBindingEntity>,
    private readonly channelService: StorageChannelService,
    private readonly purposeRegistry: StoragePurposeRegistry,
  ) {}

  async listPurposes(): Promise<StoragePurposeView[]> {
    const bindings = await this.bindingRepository.find({ relations: { channel: true } })
    const byPurpose = new Map(bindings.map((binding) => [binding.purposeCode, binding]))
    return this.purposeRegistry.list().map((purpose) => {
      const binding = byPurpose.get(purpose.code)
      return {
        ...purpose,
        bindingChannelId: binding?.channelId ?? null,
        bindingChannelName: binding?.channel?.name ?? null,
        defaultKeyPrefix: purpose.keyPrefix,
        keyPrefixOverride: binding?.keyPrefixOverride ?? null,
        keyPrefix: binding?.keyPrefixOverride ?? purpose.keyPrefix,
      }
    })
  }

  async bind(
    purposeCode: string,
    channelId: string,
    updatedBy: number | null,
    keyPrefixOverride: string | null = null,
  ): Promise<StoragePurposeView> {
    const purpose = this.purposeRegistry.get(purposeCode)
    let normalizedOverride: string | null = null
    if (keyPrefixOverride) {
      try {
        normalizedOverride = normalizeStorageKeyPrefix(keyPrefixOverride)
      } catch {
        throw new BadRequestException('Storage key prefix must be a safe path ending with /')
      }
    }
    const channel = await this.channelService.resolve(channelId)
    if (channel.channel.status !== SysStorageChannelStatus.ACTIVE) {
      throw new BadRequestException('Only an active storage channel can be bound')
    }
    if (purpose.visibility === 'public' && !channel.channel.publicBaseUrl) {
      throw new BadRequestException('A public storage purpose requires a public base URL')
    }
    const keyPrefix = normalizedOverride ?? purpose.keyPrefix
    const channelBindings = await this.bindingRepository.find({ where: { channelId } })
    for (const binding of channelBindings) {
      if (binding.purposeCode === purposeCode) continue
      const otherPurpose = this.purposeRegistry.get(binding.purposeCode)
      const otherPrefix = binding.keyPrefixOverride ?? otherPurpose.keyPrefix
      if (keyPrefix.startsWith(otherPrefix) || otherPrefix.startsWith(keyPrefix)) {
        throw new BadRequestException(
          `Storage key prefix overlaps with purpose: ${binding.purposeCode}`,
        )
      }
    }
    await this.bindingRepository.save(
      this.bindingRepository.create({
        purposeCode,
        channelId,
        keyPrefixOverride: normalizedOverride,
        updatedBy,
      }),
    )
    return (await this.listPurposes()).find((purpose) => purpose.code === purposeCode)!
  }
}
