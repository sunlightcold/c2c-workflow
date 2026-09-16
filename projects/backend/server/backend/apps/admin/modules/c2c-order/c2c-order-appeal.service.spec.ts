import {
  BusinessStatus,
  MerchantOrderAppealStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PlatformConfirmationStatus,
  PaymentOrderStatus,
} from '@admin/database'
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { MerchantEntity } from '@admin/database'
import type { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import type { C2cPlatformClient } from '../c2c-platform/c2c-platform.client'
import { C2cBuyOrderStatus } from '../c2c-platform/c2c-platform.types'
import type { C2cPlatformCredentialFactory } from '../c2c-platform/c2c-platform-credential.factory'
import type { C2cSecretResolver } from './c2c-secret-resolver'
import type { C2cOrderService } from './c2c-order.service'
import type { PaymentReceiptService } from '../payment/payment-receipt.service'
import type { C2cReceiptImageService } from './c2c-receipt-image.service'
import type { ReceiptDocumentDownloader } from './receipt-document-downloader'
import { C2cOrderAppealService, type C2cOrderAppealStore } from './c2c-order-appeal.service'

describe('C2cOrderAppealService', () => {
  const order = {
    id: 'order-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    platform: MerchantPlatform.BINANCE,
    platformOrderId: 'BIN-1',
    status: MerchantOrderStatus.PENDING_RELEASE,
    appealStatus: null,
    paymentOrder: {
      id: 'payment-1',
      status: PaymentOrderStatus.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
    },
  }
  const orders = { detail: jest.fn() }
  const merchants = { findOne: jest.fn() }
  const credentials = { getActiveReference: jest.fn() }
  const secrets = { resolve: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const platformClient = {
    getCapabilities: jest.fn(),
    getComplaintReasons: jest.fn(),
    getComplaintUploadUrl: jest.fn(),
    getOrderDetail: jest.fn(),
    submitComplaint: jest.fn(),
    uploadComplaintFile: jest.fn(),
  }
  const store: jest.Mocked<C2cOrderAppealStore> = {
    claim: jest.fn(),
    markSubmissionUncertain: jest.fn(),
    markSubmitted: jest.fn(),
    releaseClaim: jest.fn(),
    setReason: jest.fn(),
  }
  const receipts = { getReceipt: jest.fn() }
  const downloader = { download: jest.fn() }
  const receiptImages = { convert: jest.fn() }
  let service: C2cOrderAppealService

  beforeEach(() => {
    jest.clearAllMocks()
    orders.detail.mockResolvedValue(order)
    merchants.findOne.mockResolvedValue({
      id: 'merchant-1',
      tenantId: 'tenant-1',
      platform: MerchantPlatform.BINANCE,
      status: BusinessStatus.ACTIVE,
    })
    credentials.getActiveReference.mockResolvedValue({
      credentialRef: 'enc://ciphertext',
      apiBaseUrl: 'http://127.0.0.1:13002',
      clientType: 'WEB',
      xUserId: null,
      requestTimeoutMs: 5000,
    })
    secrets.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentialFactory.create.mockReturnValue({ apiKey: 'key', secretKey: 'secret' })
    platformClient.getCapabilities.mockReturnValue({ appeal: true })
    platformClient.getOrderDetail.mockResolvedValue({
      platformOrderId: 'BIN-1',
      status: C2cBuyOrderStatus.PAID,
    })
    platformClient.getComplaintReasons.mockResolvedValue([
      { reasonCode: 6, reasonDesc: '卖家收款后未放行' },
    ])
    platformClient.getComplaintUploadUrl
      .mockReset()
      .mockResolvedValueOnce({
        uploadUrl: 'http://127.0.0.1:13002/upload/1',
        filePath: '/mock/receipt-1.jpg',
      })
      .mockResolvedValueOnce({
        uploadUrl: 'http://127.0.0.1:13002/upload/2',
        filePath: '/mock/receipt-2.jpg',
      })
    platformClient.uploadComplaintFile.mockResolvedValue(undefined)
    platformClient.submitComplaint.mockResolvedValue({
      data: { complaintNo: '30006788' },
    })
    store.claim.mockResolvedValue('CLAIMED')
    store.setReason.mockResolvedValue(undefined)
    store.markSubmitted.mockResolvedValue(undefined)
    store.releaseClaim.mockResolvedValue(undefined)
    store.markSubmissionUncertain.mockResolvedValue(undefined)
    receipts.getReceipt.mockResolvedValue({
      status: 'READY',
      downloadUrl: 'https://example.test/receipt.pdf',
      message: '回单已生成',
    })
    downloader.download.mockResolvedValue(Buffer.from('%PDF'))
    receiptImages.convert.mockResolvedValue([
      { fileName: 'BIN-1-1.jpg', content: Buffer.from('page-1'), width: 100, height: 200 },
      { fileName: 'BIN-1-2.jpg', content: Buffer.from('page-2'), width: 100, height: 200 },
    ])
    service = new C2cOrderAppealService(
      orders as unknown as C2cOrderService,
      merchants as unknown as Repository<MerchantEntity>,
      credentials as unknown as MerchantPlatformCredentialService,
      secrets as unknown as C2cSecretResolver,
      credentialFactory as unknown as C2cPlatformCredentialFactory,
      platformClient as unknown as C2cPlatformClient,
      store,
      receipts as unknown as PaymentReceiptService,
      downloader as unknown as ReceiptDocumentDownloader,
      receiptImages as unknown as C2cReceiptImageService,
    )
  })

  it('returns the Binance reasons only for a paid merchant order', async () => {
    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      orderNo: 'BIN-1',
      reasons: [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }],
    })
  })

  it('gets, converts, uploads the receipt and records one submitted complaint', async () => {
    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        reasonCode: 6,
      }),
    ).resolves.toEqual({
      complaintNo: '30006788',
      orderNo: 'BIN-1',
      reason: '卖家收款后未放行',
      reasonCode: 6,
    })
    expect(store.claim).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1')
    expect(receipts.getReceipt).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'payment-1')
    expect(downloader.download).toHaveBeenCalledWith('https://example.test/receipt.pdf')
    expect(receiptImages.convert).toHaveBeenCalledWith(Buffer.from('%PDF'), 'BIN-1')
    expect(platformClient.uploadComplaintFile).toHaveBeenNthCalledWith(
      1,
      MerchantPlatform.BINANCE,
      'http://127.0.0.1:13002/upload/1',
      Buffer.from('page-1'),
    )
    expect(platformClient.uploadComplaintFile).toHaveBeenNthCalledWith(
      2,
      MerchantPlatform.BINANCE,
      'http://127.0.0.1:13002/upload/2',
      Buffer.from('page-2'),
    )
    expect(platformClient.submitComplaint).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      expect.any(Object),
      expect.objectContaining({
        description: '我已付款给卖家，卖家未放行',
        fileUrls: ['/mock/receipt-1.jpg', '/mock/receipt-2.jpg'],
      }),
    )
    expect(store.markSubmitted).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'order-1',
      '30006788',
    )
  })

  it('keeps the claim when the final submission result is uncertain', async () => {
    platformClient.submitComplaint.mockRejectedValue(new Error('timeout'))

    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        reasonCode: 6,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(store.markSubmissionUncertain).toHaveBeenCalled()
    expect(store.releaseClaim).not.toHaveBeenCalled()
  })

  it('releases the claim when receipt upload fails before submission', async () => {
    platformClient.uploadComplaintFile.mockRejectedValue(new Error('upload failed'))

    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        reasonCode: 6,
      }),
    ).rejects.toThrow('upload failed')
    expect(store.releaseClaim).toHaveBeenCalled()
    expect(platformClient.submitComplaint).not.toHaveBeenCalled()
  })

  it('releases the claim when the selected reason is no longer returned by Binance', async () => {
    platformClient.getComplaintReasons.mockResolvedValue([
      { reasonCode: 7, reasonDesc: '卖家要求取消订单' },
    ])

    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        reasonCode: 6,
      }),
    ).rejects.toThrow('申诉原因已失效')
    expect(store.releaseClaim).toHaveBeenCalled()
    expect(platformClient.getComplaintUploadUrl).not.toHaveBeenCalled()
    expect(platformClient.submitComplaint).not.toHaveBeenCalled()
  })

  it('rejects an order whose payment is not successful before calling Binance', async () => {
    orders.detail.mockResolvedValue({
      ...order,
      paymentOrder: {
        id: 'payment-1',
        status: PaymentOrderStatus.PROCESSING,
        platformConfirmStatus: PlatformConfirmationStatus.PENDING,
      },
    })

    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).rejects.toThrow(
      '支付成功且平台确认付款后才可以申诉',
    )
    expect(credentials.getActiveReference).not.toHaveBeenCalled()
    expect(platformClient.getOrderDetail).not.toHaveBeenCalled()
  })

  it('rejects an order before the independent platform confirmation succeeds', async () => {
    orders.detail.mockResolvedValue({
      ...order,
      paymentOrder: {
        id: 'payment-1',
        status: PaymentOrderStatus.SUCCESS,
        platformConfirmStatus: PlatformConfirmationStatus.FAILED,
      },
    })

    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).rejects.toThrow(
      '支付成功且平台确认付款后才可以申诉',
    )
    expect(credentials.getActiveReference).not.toHaveBeenCalled()
  })

  it('reports OKX appeals as unsupported without resolving credentials', async () => {
    orders.detail.mockResolvedValue({ ...order, platform: MerchantPlatform.OKX })
    merchants.findOne.mockResolvedValue({
      id: 'merchant-1',
      tenantId: 'tenant-1',
      platform: MerchantPlatform.OKX,
      status: BusinessStatus.ACTIVE,
    })
    platformClient.getCapabilities.mockReturnValue({ appeal: false })

    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(credentials.getActiveReference).not.toHaveBeenCalled()
    expect(platformClient.getComplaintReasons).not.toHaveBeenCalled()
  })

  it('rejects a repeated submitted appeal', async () => {
    orders.detail.mockResolvedValue({
      ...order,
      appealStatus: MerchantOrderAppealStatus.SUBMITTED,
      appealComplaintNo: '30006788',
    })

    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).rejects.toThrow(
      '已提交申诉',
    )
  })
})
