import { Inject, Injectable } from '@nestjs/common'
import { PaymentAdapterCode } from '@admin/database'
import {
  C2cPaymentPreflightVerifier,
  PAYMENT_QUERY_CONTEXT_STORE,
  type PaymentQueryContextStore,
} from './c2c-payment-preflight-verifier'
import type { PaymentExecutionResult } from './payment-adapter.types'
import {
  PAYMENT_CHANNEL_CAPABILITY_FACTORY,
  type PaymentChannelCapabilityFactory,
} from './payment-channel-capability.factory'
import {
  type ExecutablePaymentOrder,
  type PaymentExecutor,
  PaymentNotSubmittedError,
} from './payment-execution-coordinator'

@Injectable()
export class C2cAlipayPaymentExecutor implements PaymentExecutor {
  constructor(
    private readonly preflight: C2cPaymentPreflightVerifier,
    @Inject(PAYMENT_QUERY_CONTEXT_STORE)
    private readonly queryContexts: PaymentQueryContextStore,
    @Inject(PAYMENT_CHANNEL_CAPABILITY_FACTORY)
    private readonly channels: PaymentChannelCapabilityFactory,
  ) {}

  async submit(order: ExecutablePaymentOrder): Promise<PaymentExecutionResult> {
    const verified = await this.preflight.verify(order.tenantId, order.id)
    let gateway
    try {
      gateway = await this.channels.create(
        PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER,
        verified.paymentAccountCredentialRef,
      )
    } catch (error) {
      throw this.notSubmitted(error)
    }
    return gateway.order.create({
      businessNo: verified.order.paymentNo,
      amount: verified.order.amount,
      payeeIdentity: verified.order.payeeIdentity,
      payeeName: verified.order.payeeName,
    })
  }

  async query(order: ExecutablePaymentOrder): Promise<PaymentExecutionResult> {
    const context = await this.queryContexts.loadQueryContext(order.tenantId, order.id)
    const channel = await this.channels.create(
      context.adapterCode,
      context.paymentAccountCredentialRef,
    )
    if (context.executionMode === 'BATCH') {
      if (context.adapterCode !== PaymentAdapterCode.ALIPAY_BATCH || !context.batchNo)
        throw new Error('批次支付订单查单上下文不完整')
      return channel.batch.queryOrder(context.batchNo, context.order.paymentNo)
    }
    if (context.adapterCode !== PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER)
      throw new Error('即时支付订单查单通道不匹配')
    return channel.order.query(context.order.paymentNo)
  }

  private notSubmitted(error: unknown): PaymentNotSubmittedError {
    return error instanceof PaymentNotSubmittedError
      ? error
      : new PaymentNotSubmittedError(error instanceof Error ? error.message : String(error))
  }
}
