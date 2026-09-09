import { SysStorageBindingEntity, SysStorageChannelStatus } from '@admin/database'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StorageChannelService } from './storage-channel.service'
import { StoragePurposeRegistry } from './storage-purpose.registry'
import {
  S3_OBJECT_GATEWAY,
  type S3ObjectGateway,
  type StorageObjectReference,
  type StoragePresignedPut,
  type StoragePurposeDefinition,
  toStoragePublicUrl,
} from './storage.types'

@Injectable()
export class StorageService {
  constructor(
    @InjectRepository(SysStorageBindingEntity)
    private readonly bindingRepository: Repository<SysStorageBindingEntity>,
    private readonly channelService: StorageChannelService,
    private readonly purposeRegistry: StoragePurposeRegistry,
    @Inject(S3_OBJECT_GATEWAY) private readonly gateway: S3ObjectGateway,
  ) {}

  async put(
    purposeCode: string,
    options: { body: Buffer; contentType: string; objectKey: string },
  ): Promise<StorageObjectReference & { fileUrl?: string }> {
    const purpose = this.purposeRegistry.get(purposeCode)
    const { keyPrefix, target } = await this.resolvePurposeTarget(purpose)
    const objectKey = this.resolveObjectKey(purpose, keyPrefix, options.objectKey)
    this.assertObjectInput(purpose, keyPrefix, { ...options, objectKey })
    await this.gateway.put(target, { ...options, objectKey })
    return {
      channelId: target.channel.id,
      objectKey,
      ...(purpose.visibility === 'public' && target.channel.publicBaseUrl
        ? { fileUrl: toStoragePublicUrl(target.channel.publicBaseUrl, objectKey) }
        : {}),
    }
  }

  async createPresignedPut(
    purposeCode: string,
    options: { contentType: string; objectKey: string; expiresIn?: number },
  ): Promise<StoragePresignedPut> {
    const purpose = this.purposeRegistry.get(purposeCode)
    const { keyPrefix, target } = await this.resolvePurposeTarget(purpose)
    const objectKey = this.resolveObjectKey(purpose, keyPrefix, options.objectKey)
    this.assertObjectInput(purpose, keyPrefix, { ...options, objectKey })
    const putUrl = await this.gateway.createPresignedPut(target, {
      contentType: options.contentType,
      expiresIn: options.expiresIn ?? 300,
      objectKey,
    })
    return {
      channelId: target.channel.id,
      fileUrl:
        purpose.visibility === 'public' && target.channel.publicBaseUrl
          ? toStoragePublicUrl(target.channel.publicBaseUrl, objectKey)
          : undefined,
      maxSize: purpose.maxSizeBytes,
      objectKey,
      putUrl,
      requireHeaders: { 'Content-Type': options.contentType },
    }
  }

  createPresignedGet(reference: StorageObjectReference, expiresIn = 300): Promise<string> {
    return this.channelService
      .resolve(reference.channelId)
      .then((target) => this.gateway.createPresignedGet(target, reference.objectKey, expiresIn))
  }

  async delete(reference: StorageObjectReference): Promise<void> {
    await this.gateway.delete(
      await this.channelService.resolve(reference.channelId),
      reference.objectKey,
    )
  }

  async copy(source: StorageObjectReference, destination: StorageObjectReference): Promise<void> {
    if (source.channelId !== destination.channelId) {
      throw new BadRequestException('Cross-channel copy is not supported')
    }
    await this.gateway.copy(
      await this.channelService.resolve(source.channelId),
      source.objectKey,
      destination.objectKey,
    )
  }

  async getStream(reference: StorageObjectReference) {
    return this.gateway.getStream(
      await this.channelService.resolve(reference.channelId),
      reference.objectKey,
    )
  }

  async head(reference: StorageObjectReference) {
    return this.gateway.head(
      await this.channelService.resolve(reference.channelId),
      reference.objectKey,
    )
  }

  private async resolvePurposeTarget(purpose: StoragePurposeDefinition) {
    const binding = await this.bindingRepository.findOne({ where: { purposeCode: purpose.code } })
    if (!binding) throw new BadRequestException(`Storage purpose is not bound: ${purpose.code}`)
    const target = await this.channelService.resolve(binding.channelId)
    if (target.channel.status !== SysStorageChannelStatus.ACTIVE) {
      throw new BadRequestException(`Storage channel is not active: ${binding.channelId}`)
    }
    return {
      keyPrefix: binding.keyPrefixOverride ?? purpose.keyPrefix,
      target,
    }
  }

  private resolveObjectKey(
    purpose: ReturnType<StoragePurposeRegistry['get']>,
    keyPrefix: string,
    objectKey: string,
  ): string {
    const normalizedKey = objectKey.trim().replace(/^\/+/, '')
    const segments = normalizedKey.split('/')
    if (
      !normalizedKey ||
      normalizedKey.includes('\\') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new BadRequestException('Object key must be a non-empty relative path')
    }
    if (normalizedKey.startsWith(keyPrefix)) return normalizedKey
    if (normalizedKey.startsWith(purpose.keyPrefix)) {
      return `${keyPrefix}${normalizedKey.slice(purpose.keyPrefix.length)}`
    }
    return `${keyPrefix}${normalizedKey}`
  }

  private assertObjectInput(
    purpose: ReturnType<StoragePurposeRegistry['get']>,
    keyPrefix: string,
    options: { body?: Buffer; contentType: string; objectKey: string },
  ): void {
    if (!purpose.allowedMimeTypes.includes(options.contentType)) {
      throw new BadRequestException(
        `Content type is not allowed for storage purpose: ${purpose.code}`,
      )
    }
    if (!options.objectKey.startsWith(keyPrefix)) {
      throw new BadRequestException(`Object key must start with ${keyPrefix}`)
    }
    if (options.body && options.body.length > purpose.maxSizeBytes) {
      throw new BadRequestException(
        `Object exceeds the size limit for storage purpose: ${purpose.code}`,
      )
    }
  }
}
