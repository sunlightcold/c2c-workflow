import { PaymentAdapterCode } from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import {
  ALIPAY_ACCOUNT_GATEWAY_FACTORY,
  type AlipayAccountGatewayFactory,
} from './alipay-account-gateway.provider'
import {
  ALIPAY_BATCH_RECONCILIATION_POLICY,
  AlipayBatchAdapter,
  type AlipayBatchResponse,
} from './alipay-batch.adapter'
import {
  ALIPAY_MERCHANT_TRANSFER_RECONCILIATION_POLICY,
  AlipayMerchantTransferAdapter,
} from './alipay-merchant-transfer.adapter'
import { AlipayReceiptAdapter, type AlipayReceiptQueryResult } from './alipay-receipt.adapter'
import type { PaymentExecutionResult, PaymentReconciliationPolicy } from './payment-adapter.types'

export type { PaymentReconciliationPolicy } from './payment-adapter.types'

export interface PaymentChannelReconciliationPolicies {
  batch: PaymentReconciliationPolicy
  order: PaymentReconciliationPolicy
}

export interface PaymentOrderChannelCapability {
  create: (input: {
    amount: string
    businessNo: string
    payeeIdentity: string
    payeeName: string
  }) => Promise<PaymentExecutionResult>
  query: (businessNo: string) => Promise<PaymentExecutionResult>
  getReconciliationPolicy: () => PaymentReconciliationPolicy
}

export interface PaymentBatchChannelCapability {
  create: (input: {
    batchNo: string
    items: Array<{
      amount: string
      businessNo: string
      payeeIdentity: string
      payeeName: string
    }>
  }) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
  query: (batchNo: string) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
  queryOrder: (
    batchNo: string,
    businessNo: string,
  ) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
  getReconciliationPolicy: () => PaymentReconciliationPolicy
}

export interface PaymentReceiptChannelCapability {
  apply: (detailId: string) => Promise<string>
  query: (fileId: string) => Promise<AlipayReceiptQueryResult>
}

export interface PaymentChannelCapabilities {
  batch: PaymentBatchChannelCapability
  order: PaymentOrderChannelCapability
  reconciliation: PaymentChannelReconciliationPolicies
  receipt: PaymentReceiptChannelCapability
}

export interface PaymentChannelCapabilityFactory {
  create: (
    adapterCode: PaymentAdapterCode,
    credentialRef: string,
  ) => Promise<PaymentChannelCapabilities>
  getReconciliationPolicies: (
    adapterCode: PaymentAdapterCode,
  ) => PaymentChannelReconciliationPolicies
}

export const PAYMENT_CHANNEL_CAPABILITY_FACTORY = Symbol('PAYMENT_CHANNEL_CAPABILITY_FACTORY')

@Injectable()
export class AlipayPaymentChannelCapabilityFactory implements PaymentChannelCapabilityFactory {
  constructor(
    @Inject(ALIPAY_ACCOUNT_GATEWAY_FACTORY)
    private readonly gateways: AlipayAccountGatewayFactory,
  ) {}

  async create(
    adapterCode: PaymentAdapterCode,
    credentialRef: string,
  ): Promise<PaymentChannelCapabilities> {
    if (
      adapterCode !== PaymentAdapterCode.ALIPAY_BATCH &&
      adapterCode !== PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER
    ) {
      throw new Error(`支付通道 ${String(adapterCode)} 未注册能力适配器`)
    }
    const gateway = await this.gateways.create(credentialRef)
    const batch = new AlipayBatchAdapter(gateway)
    const order = new AlipayMerchantTransferAdapter(gateway)
    return {
      batch,
      order,
      reconciliation: {
        batch: batch.getReconciliationPolicy(),
        order: order.getReconciliationPolicy(),
      },
      receipt: new AlipayReceiptAdapter(gateway),
    }
  }

  getReconciliationPolicies(adapterCode: PaymentAdapterCode): PaymentChannelReconciliationPolicies {
    if (adapterCode === PaymentAdapterCode.ALIPAY_BATCH) {
      return {
        batch: { ...ALIPAY_BATCH_RECONCILIATION_POLICY },
        order: { ...ALIPAY_MERCHANT_TRANSFER_RECONCILIATION_POLICY },
      }
    }
    if (adapterCode === PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER) {
      return {
        batch: { ...ALIPAY_MERCHANT_TRANSFER_RECONCILIATION_POLICY },
        order: { ...ALIPAY_MERCHANT_TRANSFER_RECONCILIATION_POLICY },
      }
    }
    throw new Error(`支付通道 ${String(adapterCode)} 未注册回查策略`)
  }
}
