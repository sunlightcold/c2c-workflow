import { Inject, Injectable } from '@nestjs/common'
import { PaymentAdapterCode } from '@admin/database'
import { C2cPaymentPreflightVerifier } from './c2c-payment-preflight-verifier'
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
    const context = await this.preflight.loadContext(order.tenantId, order.id)
    const channel = await this.channels.create(
      PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER,
      context.account.credentialRef,
    )
    return channel.order.query(context.order.paymentNo)
  }

  private notSubmitted(error: unknown): PaymentNotSubmittedError {
    return error instanceof PaymentNotSubmittedError
      ? error
      : new PaymentNotSubmittedError(error instanceof Error ? error.message : String(error))
  }
}
