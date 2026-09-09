import type { Readable } from 'stream'
import type { SysStorageChannelEntity } from '@admin/database'

export type StorageVisibility = 'private' | 'public'

export const STORAGE_KEY_PREFIX_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)*\/$/

export function normalizeStorageKeyPrefix(value: string): string {
  const prefix = value.trim()
  if (prefix.length > 128 || !STORAGE_KEY_PREFIX_PATTERN.test(prefix)) {
    throw new Error('Storage key prefix must be a safe path ending with /')
  }
  return prefix
}

export function toStoragePublicUrl(baseUrl: string, objectKey: string): string {
  const encodedKey = objectKey.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`
}

export interface StoragePurposeDefinition {
  code: string
  group: 'app' | 'system'
  keyPrefix: string
  maxSizeBytes: number
  allowedMimeTypes: readonly string[]
  visibility: StorageVisibility
}

export interface ResolvedStorageChannel {
  accessKeyId: string
  bucket: string
  channel: SysStorageChannelEntity
  endpoint: string
  forcePathStyle: boolean
  region: string
  secretAccessKey: string
}

export interface StorageObjectReference {
  channelId: string
  objectKey: string
}

export interface StorageObjectHead {
  contentLength: number
  contentType?: string
  etag?: string
}

export interface StoragePresignedPut {
  channelId: string
  fileUrl?: string
  maxSize: number
  objectKey: string
  putUrl: string
  requireHeaders: Record<string, string>
}

export interface S3ObjectGateway {
  copy: (target: ResolvedStorageChannel, sourceKey: string, destinationKey: string) => Promise<void>
  createPresignedGet: (
    target: ResolvedStorageChannel,
    objectKey: string,
    expiresIn: number,
  ) => Promise<string>
  createPresignedPut: (
    target: ResolvedStorageChannel,
    options: { contentType: string; expiresIn: number; objectKey: string },
  ) => Promise<string>
  delete: (target: ResolvedStorageChannel, objectKey: string) => Promise<void>
  getStream: (target: ResolvedStorageChannel, objectKey: string) => Promise<Readable>
  head: (target: ResolvedStorageChannel, objectKey: string) => Promise<StorageObjectHead>
  put: (
    target: ResolvedStorageChannel,
    options: { body: Buffer; contentType: string; objectKey: string },
  ) => Promise<void>
  invalidate: (channelId: string) => void
}

export const S3_OBJECT_GATEWAY = Symbol('S3_OBJECT_GATEWAY')
