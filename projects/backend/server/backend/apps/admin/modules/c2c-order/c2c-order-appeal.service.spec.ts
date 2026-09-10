import {
  BusinessStatus,
  MerchantOrderAppealStatus,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentOrderStatus,
} from '@admin/database'
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { MerchantEntity } from '@admin/database'
import type { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import type { BinanceC2cClient } from '../c2c-platform/binance-c2c.client'
import { C2cBuyOrderStatus } from '../c2c-platform/c2c-platform.types'
import type { C2cPlatformCredentialFactory } from '../c2c-platform/c2c-platform-credential.factory'
import type { C2cSecretResolver } from './c2c-secret-resolver'
import type { C2cOrderService } from './c2c-order.service'
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
    paymentOrder: { id: 'payment-1', status: PaymentOrderStatus.COMPLETED },
  }
  const orders = { detail: jest.fn() }
  const merchants = { findOne: jest.fn() }
  const credentials = { getActiveReference: jest.fn() }
  const secrets = { resolve: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const binance = {
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
    binance.getOrderDetail.mockResolvedValue({
      platformOrderId: 'BIN-1',
      status: C2cBuyOrderStatus.PAID,
    })
    binance.getComplaintReasons.mockResolvedValue([
      { reasonCode: 6, reasonDesc: '卖家收款后未放行' },
    ])
    binance.getComplaintUploadUrl.mockResolvedValue({
      uploadUrl: 'http://127.0.0.1:13002/upload',
      filePath: '/mock/receipt.png',
    })
    binance.uploadComplaintFile.mockResolvedValue(undefined)
    binance.submitComplaint.mockResolvedValue({
      data: { complaintNo: '30006788' },
    })
    store.claim.mockResolvedValue('CLAIMED')
    store.setReason.mockResolvedValue(undefined)
    store.markSubmitted.mockResolvedValue(undefined)
    store.releaseClaim.mockResolvedValue(undefined)
    store.markSubmissionUncertain.mockResolvedValue(undefined)
    service = new C2cOrderAppealService(
      orders as unknown as C2cOrderService,
      merchants as unknown as Repository<MerchantEntity>,
      credentials as unknown as MerchantPlatformCredentialService,
      secrets as unknown as C2cSecretResolver,
      credentialFactory as unknown as C2cPlatformCredentialFactory,
      binance as unknown as BinanceC2cClient,
      store,
    )
  })

  it('returns the Binance reasons only for a paid merchant order', async () => {
    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      orderNo: 'BIN-1',
      reasons: [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }],
    })
  })

  it('uploads the receipt and records one submitted complaint', async () => {
    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        description: '我已付款给卖家，卖家未放行',
        fileName: 'receipt.png',
        receipt: Buffer.from('receipt'),
        reasonCode: 6,
      }),
    ).resolves.toEqual({
      complaintNo: '30006788',
      orderNo: 'BIN-1',
      reason: '卖家收款后未放行',
      reasonCode: 6,
    })
    expect(store.claim).toHaveBeenCalledWith('tenant-1', 'merchant-1', 'order-1')
    expect(binance.uploadComplaintFile).toHaveBeenCalledWith(
      'http://127.0.0.1:13002/upload',
      Buffer.from('receipt'),
    )
    expect(store.markSubmitted).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'order-1',
      '30006788',
    )
  })

  it('keeps the claim when the final submission result is uncertain', async () => {
    binance.submitComplaint.mockRejectedValue(new Error('timeout'))

    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        description: '我已付款给卖家，卖家未放行',
        fileName: 'receipt.png',
        receipt: Buffer.from('receipt'),
        reasonCode: 6,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(store.markSubmissionUncertain).toHaveBeenCalled()
    expect(store.releaseClaim).not.toHaveBeenCalled()
  })

  it('releases the claim when receipt upload fails before submission', async () => {
    binance.uploadComplaintFile.mockRejectedValue(new Error('upload failed'))

    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        description: '我已付款给卖家，卖家未放行',
        fileName: 'receipt.png',
        receipt: Buffer.from('receipt'),
        reasonCode: 6,
      }),
    ).rejects.toThrow('upload failed')
    expect(store.releaseClaim).toHaveBeenCalled()
    expect(binance.submitComplaint).not.toHaveBeenCalled()
  })

  it('releases the claim when the selected reason is no longer returned by Binance', async () => {
    binance.getComplaintReasons.mockResolvedValue([
      { reasonCode: 7, reasonDesc: '卖家要求取消订单' },
    ])

    await expect(
      service.submit('tenant-1', 'merchant-1', 'order-1', {
        description: '我已付款给卖家，卖家未放行',
        fileName: 'receipt.png',
        receipt: Buffer.from('receipt'),
        reasonCode: 6,
      }),
    ).rejects.toThrow('申诉原因已失效')
    expect(store.releaseClaim).toHaveBeenCalled()
    expect(binance.getComplaintUploadUrl).not.toHaveBeenCalled()
    expect(binance.submitComplaint).not.toHaveBeenCalled()
  })

  it('rejects an order whose payment is not completed before calling Binance', async () => {
    orders.detail.mockResolvedValue({
      ...order,
      paymentOrder: { id: 'payment-1', status: PaymentOrderStatus.PROCESSING },
    })

    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).rejects.toThrow(
      '支付完成后才可以申诉',
    )
    expect(credentials.getActiveReference).not.toHaveBeenCalled()
    expect(binance.getOrderDetail).not.toHaveBeenCalled()
  })

  it('reports OKX appeals as unsupported without calling Binance', async () => {
    orders.detail.mockResolvedValue({ ...order, platform: MerchantPlatform.OKX })

    await expect(service.getReasons('tenant-1', 'merchant-1', 'order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(binance.getComplaintReasons).not.toHaveBeenCalled()
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
