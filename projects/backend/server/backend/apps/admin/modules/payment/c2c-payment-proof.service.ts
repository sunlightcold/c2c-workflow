import { Injectable } from '@nestjs/common'
import type { C2cPaymentProofImage } from '../c2c-platform'
import { C2cReceiptImageService } from '../c2c-order/c2c-receipt-image.service'
import { ReceiptDocumentDownloader } from '../c2c-order/receipt-document-downloader'
import { PaymentReceiptService } from './payment-receipt.service'

export interface C2cPaymentProofRequest {
  tenantId: string
  merchantId: string
  paymentOrderId: string
  platformOrderId: string
}

@Injectable()
export class C2cPaymentProofService {
  constructor(
    private readonly receipts: PaymentReceiptService,
    private readonly downloader: ReceiptDocumentDownloader,
    private readonly images: C2cReceiptImageService,
  ) {}

  async load(input: C2cPaymentProofRequest): Promise<C2cPaymentProofImage[]> {
    const receipt = await this.receipts.getReceipt(
      input.tenantId,
      input.merchantId,
      input.paymentOrderId,
    )
    if (receipt.status !== 'READY' || !receipt.downloadUrl) {
      throw new Error(`付款回单暂不可用：${receipt.message || '上游回单尚未生成'}`)
    }
    const document = await this.downloader.download(receipt.downloadUrl)
    const images = await this.images.convert(document, input.platformOrderId)
    if (!images.length) throw new Error('付款回单未生成可上传的图片')
    return images.map((image) => ({ ...image, imageType: 'jpeg' as const }))
  }
}
