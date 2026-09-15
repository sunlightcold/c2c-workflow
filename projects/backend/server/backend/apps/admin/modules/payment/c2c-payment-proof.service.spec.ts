import { C2cPaymentProofService } from './c2c-payment-proof.service'

describe('C2cPaymentProofService', () => {
  const receipts = { getReceipt: jest.fn() }
  const downloader = { download: jest.fn() }
  const images = { convert: jest.fn() }
  const service = new C2cPaymentProofService(
    receipts as never,
    downloader as never,
    images as never,
  )

  beforeEach(() => jest.clearAllMocks())

  it('loads the real Alipay receipt and converts it into OKX payment proof images', async () => {
    receipts.getReceipt.mockResolvedValue({
      status: 'READY',
      downloadUrl: 'https://receipt.example/PAY001.pdf',
      message: '回单已生成',
    })
    downloader.download.mockResolvedValue(Buffer.from('%PDF receipt'))
    images.convert.mockResolvedValue([
      {
        content: Buffer.from('jpeg'),
        fileName: 'OKX-1-1.jpg',
        width: 800,
        height: 1200,
      },
    ])

    await expect(
      service.load({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        paymentOrderId: 'payment-1',
        platformOrderId: 'OKX-1',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        fileName: 'OKX-1-1.jpg',
        imageType: 'jpeg',
      }),
    ])
    expect(receipts.getReceipt).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'payment-1')
    expect(downloader.download).toHaveBeenCalledWith('https://receipt.example/PAY001.pdf')
    expect(images.convert).toHaveBeenCalledWith(expect.any(Buffer), 'OKX-1')
  })

  it('stops before downloading when the payment receipt is not ready', async () => {
    receipts.getReceipt.mockResolvedValue({ status: 'FAILED', message: '上游回单尚未生成' })

    await expect(
      service.load({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        paymentOrderId: 'payment-1',
        platformOrderId: 'OKX-1',
      }),
    ).rejects.toThrow('上游回单尚未生成')
    expect(downloader.download).not.toHaveBeenCalled()
    expect(images.convert).not.toHaveBeenCalled()
  })
})
