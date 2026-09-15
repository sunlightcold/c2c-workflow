import { MerchantPlatform } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { BinanceC2cClient, type BinanceCredentials } from './binance-c2c.client'
import type {
  C2cBuyOrderDetail,
  C2cBuyOrderPage,
  C2cCapabilities,
  C2cComplaintPayload,
  C2cComplaintReason,
  C2cComplaintSubmissionResult,
  C2cComplaintUpload,
  C2cListInput,
  C2cMarkPaidPolicy,
  C2cMarkPaidOptions,
} from './c2c-platform.types'
import { OkxWebPrivateClient, type OkxWebPrivateCredentials } from './okx-web-private.client'

export type C2cPlatformCredentials = BinanceCredentials | OkxWebPrivateCredentials
export type C2cPlatformCapability = keyof C2cCapabilities

export class C2cPlatformCapabilityError extends Error {
  constructor(
    readonly platform: MerchantPlatform,
    readonly capability: C2cPlatformCapability,
  ) {
    super(`${platform} 不支持 C2C 能力 ${capability}`)
    this.name = 'C2cPlatformCapabilityError'
  }
}

/**
 * Provider-neutral entry point for every C2C business workflow. Platform
 * request protocols stay in the concrete clients; callers never select one.
 */
@Injectable()
export class C2cPlatformClient {
  constructor(
    private readonly binance: BinanceC2cClient,
    private readonly okx: OkxWebPrivateClient,
  ) {}

  getCapabilities(platform: MerchantPlatform): C2cCapabilities {
    return this.resolveCapabilities(platform)
  }

  getMarkPaidPolicy(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
  ): C2cMarkPaidPolicy {
    this.requireCapability(platform, 'markOrderAsPaid')
    return platform === MerchantPlatform.BINANCE
      ? this.binance.getMarkPaidPolicy(credentials as BinanceCredentials)
      : this.okx.getMarkPaidPolicy(credentials as OkxWebPrivateCredentials)
  }

  listOrders(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    input: C2cListInput,
  ): Promise<C2cBuyOrderPage> {
    this.requireCapability(platform, 'listOrders')
    return platform === MerchantPlatform.BINANCE
      ? this.binance.listOrders(credentials as BinanceCredentials, input)
      : this.okx.listOrders(credentials as OkxWebPrivateCredentials, input)
  }

  getOrderDetail(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    orderId: string,
  ): Promise<C2cBuyOrderDetail> {
    this.requireCapability(platform, 'getOrderDetail')
    return platform === MerchantPlatform.BINANCE
      ? this.binance.getOrderDetail(credentials as BinanceCredentials, orderId)
      : this.okx.getOrderDetail(credentials as OkxWebPrivateCredentials, orderId)
  }

  async markOrderAsPaid(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    orderId: string,
    paymentMethodId: string,
    options?: C2cMarkPaidOptions,
  ): Promise<void> {
    this.requireCapability(platform, 'markOrderAsPaid')
    if (platform === MerchantPlatform.BINANCE) {
      await this.binance.markOrderAsPaid(
        credentials as BinanceCredentials,
        orderId,
        paymentMethodId,
        options,
      )
      return
    }
    await this.okx.markOrderAsPaid(
      credentials as OkxWebPrivateCredentials,
      orderId,
      paymentMethodId,
      options,
    )
  }

  async getComplaintReasons(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    orderId: string,
  ): Promise<C2cComplaintReason[]> {
    this.requireCapability(platform, 'appeal')
    return this.binance.getComplaintReasons(credentials as BinanceCredentials, orderId)
  }

  async getComplaintUploadUrl(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    fileName: string,
  ): Promise<C2cComplaintUpload> {
    this.requireCapability(platform, 'appeal')
    return this.binance.getComplaintUploadUrl(credentials as BinanceCredentials, fileName)
  }

  async uploadComplaintFile(
    platform: MerchantPlatform,
    uploadUrl: string,
    content: Buffer,
  ): Promise<void> {
    this.requireCapability(platform, 'appeal')
    await this.binance.uploadComplaintFile(uploadUrl, content)
  }

  async submitComplaint(
    platform: MerchantPlatform,
    credentials: C2cPlatformCredentials,
    payload: C2cComplaintPayload,
  ): Promise<C2cComplaintSubmissionResult> {
    this.requireCapability(platform, 'appeal')
    return this.binance.submitComplaint(credentials as BinanceCredentials, payload)
  }

  private requireCapability(platform: MerchantPlatform, capability: C2cPlatformCapability): void {
    if (!this.resolveCapabilities(platform)[capability]) {
      throw new C2cPlatformCapabilityError(platform, capability)
    }
  }

  private resolveCapabilities(platform: MerchantPlatform): C2cCapabilities {
    if (platform === MerchantPlatform.BINANCE) return this.binance.getCapabilities()
    if (platform === MerchantPlatform.OKX) return this.okx.getCapabilities()
    throw new Error(`不支持的 C2C 平台: ${String(platform)}`)
  }
}
