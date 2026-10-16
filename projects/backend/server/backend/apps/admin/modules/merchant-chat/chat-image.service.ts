import {
  Inject,
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common'
import { finalize } from 'rxjs'
import { lookup } from 'node:dns/promises'
import { BlockList } from 'node:net'
import sharp from 'sharp'
import {
  C2C_HTTP_TRANSPORT,
  C2cSensitiveRequestError,
  type C2cHttpTransport,
} from '../c2c-platform/c2c-platform.types'
import { CHAT_MAX_IMAGE_BYTES, ChatError, type ChatScope } from './chat.types'

const hosts = new Set([
  'static-file-1306379396.file.myqcloud.com',
  'static.qa1fdg.net',
  'tk-qa1-s3-bucket.s3.ap-northeast-1.amazonaws.com',
])
const blocked = new BlockList()
const blockedV6 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4')
blockedV6.addAddress('::', 'ipv6')
blockedV6.addAddress('::1', 'ipv6')
blockedV6.addSubnet('fc00::', 7, 'ipv6')
blockedV6.addSubnet('fe80::', 10, 'ipv6')
blockedV6.addSubnet('::ffff:0:0', 96, 'ipv6')
blockedV6.addSubnet('ff00::', 8, 'ipv6')

export function requireChatImageUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ChatError('CHAT_ATTACHMENT_UNSUPPORTED', '平台图片地址不受支持', 400)
  }
  if (
    url.protocol !== 'https:' ||
    !hosts.has(url.hostname) ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    !/^\/(?:tmp\/)?client_upload\/c2c\/chat\/[\w/.-]+$/.test(url.pathname) ||
    url.pathname.includes('..')
  )
    throw new ChatError('CHAT_ATTACHMENT_UNSUPPORTED', '平台图片地址不受支持', 400)
  return url
}
@Injectable()
export class ChatImageService {
  private active = 0
  constructor(@Inject(C2C_HTTP_TRANSPORT) private readonly http: C2cHttpTransport) {}
  acquire() {
    if (this.active >= 4)
      throw new ChatError('CHAT_ATTACHMENT_BUSY', '图片处理繁忙，请稍后重试', 429)
    this.active++
  }
  release() {
    this.active--
  }
  async inspect(content: Buffer, mime?: string) {
    if (!content.length || content.length > CHAT_MAX_IMAGE_BYTES)
      throw new ChatError('CHAT_ATTACHMENT_TOO_LARGE', '图片大小必须在 10 MiB 内', 413)
    try {
      const metadata = await sharp(content, {
        limitInputPixels: 25_000_000,
        animated: false,
      }).metadata()
      const format = metadata.format
      if (
        !['jpeg', 'png', 'webp'].includes(format ?? '') ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) > 1 ||
        metadata.width * metadata.height > 25_000_000 ||
        (mime && mime !== `image/${format}`)
      )
        throw new Error('unsupported')
      await sharp(content, { limitInputPixels: 25_000_000, failOn: 'warning' }).raw().toBuffer()
      return {
        type: format as 'jpeg' | 'png' | 'webp',
        mime: `image/${format}`,
        width: metadata.width,
        height: metadata.height,
      }
    } catch {
      throw new ChatError(
        'CHAT_ATTACHMENT_UNSUPPORTED',
        '仅支持有效的 JPEG、PNG、WebP 静态图片',
        400,
      )
    }
  }
  async transfer(scope: ChatScope, value: string, content?: Buffer) {
    const url = requireChatImageUrl(value)
    try {
      const addresses = await lookup(url.hostname, { all: true })
      if (
        !addresses.length ||
        addresses.some((a) =>
          a.family === 6 ? blockedV6.check(a.address, 'ipv6') : blocked.check(a.address, 'ipv4'),
        )
      )
        throw new Error('private address')
      const pinnedLookup = async () =>
        addresses.map((address) => ({
          address: address.address,
          family: address.family === 6 ? (6 as const) : (4 as const),
        }))
      return await this.http.request<Buffer>({
        method: content ? 'PUT' : 'GET',
        url: url.toString(),
        proxyScope: scope,
        headers: content ? { 'Content-Type': 'application/octet-stream' } : {},
        body: content,
        timeoutMs: 15_000,
        maxBytes: CHAT_MAX_IMAGE_BYTES,
        maxRedirects: 0,
        responseType: 'arraybuffer',
        sensitive: true,
        lookup: pinnedLookup,
      })
    } catch (error) {
      if (
        error instanceof C2cSensitiveRequestError &&
        error.statusCode &&
        error.statusCode >= 300 &&
        error.statusCode < 400
      )
        throw new ChatError('CHAT_ATTACHMENT_REDIRECT_FORBIDDEN', '图片地址禁止重定向', 502)
      throw new ChatError(
        content ? 'CHAT_ATTACHMENT_UPLOAD_FAILED' : 'CHAT_ATTACHMENT_DOWNLOAD_FAILED',
        content ? '图片上传失败' : '图片读取失败',
        502,
      )
    }
  }
}
@Injectable()
export class ChatImageLimitInterceptor implements NestInterceptor {
  constructor(private readonly images: ChatImageService) {}
  intercept(_context: ExecutionContext, next: CallHandler) {
    this.images.acquire()
    return next.handle().pipe(finalize(() => this.images.release()))
  }
}
