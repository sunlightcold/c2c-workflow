jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }))
import { lookup } from 'node:dns/promises'
import sharp from 'sharp'
import { ChatImageService, requireChatImageUrl } from './chat-image.service'
import { C2cSensitiveRequestError } from '../c2c-platform/c2c-platform.types'

describe('Chat protected images', () => {
  const scope = { tenantId: 'tenant', merchantId: 'merchant' }
  const url =
    'https://static-file-1306379396.file.myqcloud.com/client_upload/c2c/chat/20261016/image.png'
  const http = { request: jest.fn() }
  let images: ChatImageService
  beforeEach(() => {
    jest.clearAllMocks()
    images = new ChatImageService(http)
    jest.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never)
  })
  it.each([
    'http://127.0.0.1/a.png',
    'https://evil.example/client_upload/c2c/chat/a.png',
    `${url.replace('/client_upload/', '/other/')}`,
    `https://user:pass@${url.slice(8)}`,
    'https://static-file-1306379396.file.myqcloud.com:444/client_upload/c2c/chat/a.png',
  ])('rejects an unsupported target: %s', (value) => {
    expect(() => requireChatImageUrl(value)).toThrow('地址不受支持')
  })
  it('uses the merchant scope, bounded bytes, pinned public DNS and no redirects without API credentials', async () => {
    http.request.mockResolvedValue(Buffer.from('uploaded'))
    const content = Buffer.from('image')
    await images.transfer(scope, `${url}?signature=not-logged`, content)
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        body: content,
        proxyScope: scope,
        maxRedirects: 0,
        maxBytes: 10 * 1024 * 1024,
        sensitive: true,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    )
    expect(await http.request.mock.calls[0][0].lookup('ignored', {})).toEqual([
      { address: '8.8.8.8', family: 4 },
    ])
    jest.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never)
    await expect(images.transfer(scope, url)).rejects.toThrow('读取失败')
    expect(http.request).toHaveBeenCalledTimes(1)
  })
  it('checks actual image format, dimensions and the memory concurrency bound', async () => {
    const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: 'white' } })
      .png()
      .toBuffer()
    await expect(images.inspect(png, 'image/png')).resolves.toMatchObject({
      type: 'png',
      width: 2,
      height: 3,
    })
    await expect(images.inspect(png, 'image/jpeg')).rejects.toThrow('仅支持有效')
    await expect(images.inspect(png.subarray(0, 50), 'image/png')).rejects.toThrow('仅支持有效')
    await expect(images.inspect(Buffer.from('<svg/>'), 'image/png')).rejects.toThrow('仅支持有效')
    for (let i = 0; i < 4; i++) images.acquire()
    expect(() => images.acquire()).toThrow('图片处理繁忙')
    images.release()
    expect(() => images.acquire()).not.toThrow()
  })
  it('reports redirect rejection without following an upstream image target', async () => {
    http.request.mockRejectedValueOnce(new C2cSensitiveRequestError(302))
    await expect(images.transfer(scope, url)).rejects.toMatchObject({
      reasonCode: 'CHAT_ATTACHMENT_REDIRECT_FORBIDDEN',
    })
    expect(http.request).toHaveBeenCalledTimes(1)
  })
})
