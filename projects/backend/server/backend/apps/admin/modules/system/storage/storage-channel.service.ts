import {
  SysStorageChannelEntity,
  SysStorageChannelProvider,
  SysStorageChannelStatus,
} from '@admin/database'
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { CredentialCipherService } from '../credential'
import { StoragePublicAccessProbe } from './storage-public-access.probe'
import {
  S3_OBJECT_GATEWAY,
  type ResolvedStorageChannel,
  type S3ObjectGateway,
  toStoragePublicUrl,
} from './storage.types'

export interface StorageChannelView {
  accessKeyId: string
  bucket: string
  code: string
  credentialVersion: number
  endpoint: string
  forcePathStyle: boolean
  hasSecret: boolean
  id: string
  lastCheckedAt: Date | null
  lastCheckMessage: string | null
  name: string
  provider: SysStorageChannelProvider
  publicBaseUrl: string | null
  region: string
  status: SysStorageChannelStatus
  updatedAt: Date
}

@Injectable()
export class StorageChannelService {
  private readonly logger = new Logger(StorageChannelService.name)

  constructor(
    @InjectRepository(SysStorageChannelEntity)
    private readonly channelRepository: Repository<SysStorageChannelEntity>,
    private readonly credentialService: CredentialCipherService,
    @Inject(S3_OBJECT_GATEWAY) private readonly gateway: S3ObjectGateway,
    private readonly publicAccessProbe: StoragePublicAccessProbe,
  ) {}

  async list(): Promise<StorageChannelView[]> {
    const channels = await this.channelRepository.find({ order: { updatedAt: 'DESC' } })
    return channels.map((channel) => this.toView(channel))
  }

  async get(id: string): Promise<StorageChannelView> {
    return this.toView(await this.requireChannel(id))
  }

  async findByCode(code: string): Promise<StorageChannelView | null> {
    const channel = await this.channelRepository.findOne({ where: { code } })
    return channel ? this.toView(channel) : null
  }

  async create(input: {
    accessKeyId: string
    bucket: string
    code: string
    endpoint: string
    forcePathStyle: boolean
    name: string
    provider: SysStorageChannelProvider
    publicBaseUrl?: string | null
    region: string
    secretAccessKey: string
  }): Promise<StorageChannelView> {
    const existing = await this.channelRepository.findOne({ where: { code: input.code } })
    if (existing)
      throw new BadRequestException(`Storage channel code already exists: ${input.code}`)
    const channel = this.channelRepository.create({
      ...input,
      encryptedSecretAccessKey: this.credentialService.encrypt(input.secretAccessKey),
      status: SysStorageChannelStatus.DISABLED,
      lastCheckedAt: null,
      lastCheckMessage: null,
    })
    return this.toView(await this.channelRepository.save(channel))
  }

  async update(
    id: string,
    input: { name?: string; publicBaseUrl?: string | null },
  ): Promise<StorageChannelView> {
    const channel = await this.requireChannel(id)
    if (input.name !== undefined) channel.name = input.name
    if (input.publicBaseUrl !== undefined) channel.publicBaseUrl = input.publicBaseUrl
    return this.toView(await this.channelRepository.save(channel))
  }

  async rotateCredentials(
    id: string,
    input: { accessKeyId: string; secretAccessKey: string },
  ): Promise<StorageChannelView> {
    const channel = await this.requireChannel(id)
    channel.accessKeyId = input.accessKeyId
    channel.encryptedSecretAccessKey = this.credentialService.encrypt(input.secretAccessKey)
    channel.credentialVersion += 1
    channel.status = SysStorageChannelStatus.DISABLED
    channel.lastCheckMessage = 'Credentials changed; connection test required'
    this.gateway.invalidate(channel.id)
    return this.toView(await this.channelRepository.save(channel))
  }

  async test(id: string): Promise<StorageChannelView> {
    const channel = await this.requireChannel(id)
    const target = this.resolveTarget(channel)
    const objectKey = `__storage-health/${randomUUID()}.txt`
    const payload = Buffer.from(`storage-health-check:${objectKey.split('/').at(-1)}`)
    let uploaded = false
    try {
      await this.gateway.put(target, {
        body: payload,
        contentType: 'text/plain',
        objectKey,
      })
      uploaded = true
      const head = await this.gateway.head(target, objectKey)
      if (head.contentLength !== payload.length) {
        throw new Error('Authenticated object metadata mismatch')
      }
      const authenticatedBody = await this.readStream(
        await this.gateway.getStream(target, objectKey),
      )
      if (!authenticatedBody.equals(payload)) {
        throw new Error('Authenticated object content mismatch')
      }
      if (channel.publicBaseUrl) {
        const publicBody = await this.publicAccessProbe.read(
          toStoragePublicUrl(channel.publicBaseUrl, objectKey),
        )
        if (!publicBody.equals(payload)) throw new Error('Public object content mismatch')
      }
      await this.gateway.delete(target, objectKey)
      uploaded = false
      channel.lastCheckedAt = new Date()
      channel.lastCheckMessage = channel.publicBaseUrl
        ? 'Authenticated and public access ok'
        : 'Authenticated access ok'
      if (channel.status === SysStorageChannelStatus.ERROR)
        channel.status = SysStorageChannelStatus.DISABLED
      return this.toView(await this.channelRepository.save(channel))
    } catch (error: unknown) {
      channel.status = SysStorageChannelStatus.ERROR
      channel.lastCheckedAt = new Date()
      channel.lastCheckMessage = this.toErrorMessage(error).slice(0, 512)
      await this.channelRepository.save(channel)
      throw new BadRequestException(`Storage channel test failed: ${channel.lastCheckMessage}`)
    } finally {
      if (uploaded) {
        try {
          await this.gateway.delete(target, objectKey)
        } catch (error: unknown) {
          this.logger.warn(`Storage health-check cleanup failed: ${this.toErrorMessage(error)}`)
        }
      }
    }
  }

  async enable(id: string): Promise<StorageChannelView> {
    const tested = await this.test(id)
    const channel = await this.requireChannel(tested.id)
    channel.status = SysStorageChannelStatus.ACTIVE
    return this.toView(await this.channelRepository.save(channel))
  }

  async disable(id: string): Promise<StorageChannelView> {
    const channel = await this.requireChannel(id)
    channel.status = SysStorageChannelStatus.DISABLED
    return this.toView(await this.channelRepository.save(channel))
  }

  async remove(id: string): Promise<void> {
    const channel = await this.requireChannel(id)
    if (channel.status === SysStorageChannelStatus.ACTIVE) {
      throw new BadRequestException('Disable the storage channel before deleting it')
    }
    try {
      await this.channelRepository.delete(id)
    } catch (error: unknown) {
      if (['23001', '23503'].includes((error as { code?: string }).code ?? '')) {
        throw new BadRequestException('Storage channel is still referenced')
      }
      throw error
    }
  }

  async resolve(id: string): Promise<ResolvedStorageChannel> {
    return this.resolveTarget(await this.requireChannel(id))
  }

  private resolveTarget(channel: SysStorageChannelEntity): ResolvedStorageChannel {
    return {
      accessKeyId: channel.accessKeyId,
      bucket: channel.bucket,
      channel,
      endpoint: channel.endpoint,
      forcePathStyle: channel.forcePathStyle,
      region: channel.region,
      secretAccessKey: this.credentialService.decrypt(channel.encryptedSecretAccessKey),
    }
  }

  private async requireChannel(id: string): Promise<SysStorageChannelEntity> {
    const channel = await this.channelRepository.findOne({ where: { id } })
    if (!channel) throw new NotFoundException(`Storage channel not found: ${id}`)
    return channel
  }

  private toView(channel: SysStorageChannelEntity): StorageChannelView {
    return {
      accessKeyId: channel.accessKeyId,
      bucket: channel.bucket,
      code: channel.code,
      credentialVersion: channel.credentialVersion,
      endpoint: channel.endpoint,
      forcePathStyle: channel.forcePathStyle,
      hasSecret: true,
      id: channel.id,
      lastCheckedAt: channel.lastCheckedAt ?? null,
      lastCheckMessage: channel.lastCheckMessage ?? null,
      name: channel.name,
      provider: channel.provider,
      publicBaseUrl: channel.publicBaseUrl ?? null,
      region: channel.region,
      status: channel.status,
      updatedAt: channel.updatedAt,
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private async readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    return Buffer.concat(chunks)
  }
}
