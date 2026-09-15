import { Injectable } from '@nestjs/common'
import axios from 'axios'

const MAX_RECEIPT_BYTES = 20 * 1024 * 1024

@Injectable()
export class ReceiptDocumentDownloader {
  async download(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(this.requireHttpUrl(url), {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: MAX_RECEIPT_BYTES,
      maxBodyLength: MAX_RECEIPT_BYTES,
    })
    const content = Buffer.from(response.data)
    if (!content.length) throw new Error('下载的付款回单为空')
    if (content.length > MAX_RECEIPT_BYTES) throw new Error('付款回单超过 20MB 限制')
    if (content.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new Error('付款回单下载内容不是 PDF')
    }
    return content
  }

  private requireHttpUrl(value: string): string {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('付款回单下载地址无效')
    }
    return url.toString()
  }
}
