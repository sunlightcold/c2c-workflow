jest.mock('@admin/database', () => ({
  SysStorageChannelEntity: class SysStorageChannelEntity {},
  SysStorageChannelProvider: { S3_COMPATIBLE: 's3_compatible' },
  SysStorageChannelStatus: { ACTIVE: 'active', DISABLED: 'disabled', ERROR: 'error' },
}))
jest.mock('../credential', () => ({
  CredentialCipherService: class CredentialCipherService {},
}))

import {
  SysStorageChannelEntity,
  SysStorageChannelProvider,
  SysStorageChannelStatus,
} from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { Readable } from 'stream'
import { StorageChannelService } from './storage-channel.service'
import { CredentialCipherService } from '../credential'
import { StoragePublicAccessProbe } from './storage-public-access.probe'
import { S3_OBJECT_GATEWAY } from './storage.types'

describe('StorageChannelService', () => {
  const channelId = '00000000-0000-4000-8000-000000000001'
  const channel: SysStorageChannelEntity = Object.assign(new SysStorageChannelEntity(), {
    accessKeyId: 'access-key',
    bucket: 'assets',
    code: 'assets',
    credentialVersion: 1,
    encryptedSecretAccessKey: 'encrypted-secret',
    endpoint: 'https://s3.example.com',
    forcePathStyle: true,
    id: channelId,
    lastCheckedAt: null,
    lastCheckMessage: null,
    name: 'Assets',
    provider: SysStorageChannelProvider.S3_COMPATIBLE,
    publicBaseUrl: null,
    region: 'auto',
    status: SysStorageChannelStatus.DISABLED,
    createdAt: new Date('2026-07-24T00:00:00.000Z'),
    updatedAt: new Date('2026-07-24T00:00:00.000Z'),
  })
  const channelRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  }
  const credentialService = {
    decrypt: jest.fn().mockReturnValue('secret-key'),
  }
  const gateway = {
    delete: jest.fn(),
    getStream: jest.fn(),
    head: jest.fn(),
    put: jest.fn(),
  }
  const publicAccessProbe = {
    read: jest.fn(),
  }
  let service: StorageChannelService

  beforeEach(async () => {
    jest.clearAllMocks()
    Object.assign(channel, {
      lastCheckedAt: null,
      lastCheckMessage: null,
      publicBaseUrl: null,
      status: SysStorageChannelStatus.DISABLED,
    })
    channelRepository.findOne.mockResolvedValue(channel)
    channelRepository.save.mockImplementation(async (value) => value)
    gateway.put.mockResolvedValue(undefined)
    gateway.head.mockImplementation(async (_target, objectKey: string) => ({
      contentLength: Buffer.byteLength(`storage-health-check:${objectKey.split('/').at(-1)}`),
      contentType: 'text/plain',
    }))
    gateway.getStream.mockImplementation(async (_target, objectKey: string) =>
      Readable.from([Buffer.from(`storage-health-check:${objectKey.split('/').at(-1)}`)]),
    )
    gateway.delete.mockResolvedValue(undefined)

    const module = await Test.createTestingModule({
      providers: [
        StorageChannelService,
        { provide: getRepositoryToken(SysStorageChannelEntity), useValue: channelRepository },
        { provide: CredentialCipherService, useValue: credentialService },
        { provide: S3_OBJECT_GATEWAY, useValue: gateway },
        { provide: StoragePublicAccessProbe, useValue: publicAccessProbe },
      ],
    }).compile()
    service = module.get(StorageChannelService)
  })

  it('validates authenticated object access without requiring a public URL', async () => {
    await expect(service.test(channelId)).resolves.toMatchObject({
      lastCheckMessage: 'Authenticated access ok',
      status: SysStorageChannelStatus.DISABLED,
    })
    expect(publicAccessProbe.read).not.toHaveBeenCalled()
    expect(gateway.delete).toHaveBeenCalledTimes(1)
  })

  it('validates anonymous object access when a public base URL is configured', async () => {
    channel.publicBaseUrl = 'https://cdn.example.com/base'
    publicAccessProbe.read.mockImplementation(async (url: string) => {
      const objectKey = new URL(url).pathname.replace('/base/', '')
      return Buffer.from(`storage-health-check:${objectKey.split('/').at(-1)}`)
    })

    await expect(service.test(channelId)).resolves.toMatchObject({
      lastCheckMessage: 'Authenticated and public access ok',
    })
    expect(publicAccessProbe.read).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/cdn\.example\.com\/base\/__storage-health\//),
    )
  })

  it('rejects a public URL that does not return the uploaded object', async () => {
    channel.publicBaseUrl = 'https://cdn.example.com'
    publicAccessProbe.read.mockResolvedValue(Buffer.from('not-the-uploaded-object'))

    await expect(service.test(channelId)).rejects.toBeInstanceOf(BadRequestException)
    expect(channel.status).toBe(SysStorageChannelStatus.ERROR)
    expect(channel.lastCheckMessage).toBe('Public object content mismatch')
    expect(gateway.delete).toHaveBeenCalledTimes(1)
  })

  it('rejects a channel without delete permission', async () => {
    gateway.delete.mockRejectedValue(new Error('Access denied'))

    await expect(service.test(channelId)).rejects.toBeInstanceOf(BadRequestException)
    expect(channel.status).toBe(SysStorageChannelStatus.ERROR)
    expect(channel.lastCheckMessage).toBe('Access denied')
  })
})
