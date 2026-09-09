import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { Readable } from 'stream'
import type { ResolvedStorageChannel, S3ObjectGateway, StorageObjectHead } from './storage.types'

@Injectable()
export class AwsS3ObjectGateway implements S3ObjectGateway {
  private readonly clients = new Map<string, S3Client>()

  async copy(
    target: ResolvedStorageChannel,
    sourceKey: string,
    destinationKey: string,
  ): Promise<void> {
    await this.getClient(target).send(
      new CopyObjectCommand({
        Bucket: target.bucket,
        CopySource: `${target.bucket}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
      }),
    )
  }

  createPresignedGet(
    target: ResolvedStorageChannel,
    objectKey: string,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.getClient(target),
      new GetObjectCommand({ Bucket: target.bucket, Key: objectKey }),
      { expiresIn },
    )
  }

  createPresignedPut(
    target: ResolvedStorageChannel,
    options: { contentType: string; expiresIn: number; objectKey: string },
  ): Promise<string> {
    return getSignedUrl(
      this.getClient(target),
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: options.objectKey,
        ContentType: options.contentType,
      }),
      { expiresIn: options.expiresIn },
    )
  }

  async delete(target: ResolvedStorageChannel, objectKey: string): Promise<void> {
    await this.getClient(target).send(
      new DeleteObjectCommand({ Bucket: target.bucket, Key: objectKey }),
    )
  }

  async getStream(target: ResolvedStorageChannel, objectKey: string): Promise<Readable> {
    const response = await this.getClient(target).send(
      new GetObjectCommand({ Bucket: target.bucket, Key: objectKey }),
    )
    if (!response.Body)
      throw new InternalServerErrorException('Object storage returned an empty body')
    return response.Body as Readable
  }

  async head(target: ResolvedStorageChannel, objectKey: string): Promise<StorageObjectHead> {
    const response = await this.getClient(target).send(
      new HeadObjectCommand({ Bucket: target.bucket, Key: objectKey }),
    )
    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType,
      etag: response.ETag?.replace(/^"|"$/g, ''),
    }
  }

  async put(
    target: ResolvedStorageChannel,
    options: { body: Buffer; contentType: string; objectKey: string },
  ): Promise<void> {
    await this.getClient(target).send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: options.objectKey,
        Body: options.body,
        ContentType: options.contentType,
      }),
    )
  }

  invalidate(channelId: string): void {
    for (const key of this.clients.keys()) {
      if (key.startsWith(`${channelId}:`)) this.clients.delete(key)
    }
  }

  private getClient(target: ResolvedStorageChannel): S3Client {
    const cacheKey = `${target.channel.id}:${target.channel.credentialVersion}`
    const cached = this.clients.get(cacheKey)
    if (cached) return cached
    const client = new S3Client({
      region: target.region,
      endpoint: target.endpoint,
      credentials: {
        accessKeyId: target.accessKeyId,
        secretAccessKey: target.secretAccessKey,
      },
      forcePathStyle: target.forcePathStyle,
    })
    this.clients.set(cacheKey, client)
    return client
  }
}
