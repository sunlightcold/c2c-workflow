import { Inject, Injectable } from '@nestjs/common'
import {
  ALIPAY_ACCOUNT_GATEWAY_FACTORY,
  type AlipayAccountGatewayFactory,
} from './alipay-account-gateway.provider'
import { AlipayMerchantTransferAdapter } from './alipay-merchant-transfer.adapter'
import { C2cPaymentPreflightVerifier } from './c2c-payment-preflight-verifier'
import type { PaymentExecutionResult } from './payment-adapter.types'
import {
  type ExecutablePaymentOrder,
  type PaymentExecutor,
  PaymentNotSubmittedError,
} from './payment-execution-coordinator'

@Injectable()
export class C2cAlipayPaymentExecutor implements PaymentExecutor {
  constructor(
    private readonly preflight: C2cPaymentPreflightVerifier,
    @Inject(ALIPAY_ACCOUNT_GATEWAY_FACTORY)
    private readonly gateways: AlipayAccountGatewayFactory,
  ) {}

  async submit(order: ExecutablePaymentOrder): Promise<PaymentExecutionResult> {
    const verified = await this.preflight.verify(order.tenantId, order.id)
    let gateway
    try {
      gateway = await this.createGateway(verified.paymentAccountCredentialRef)
    } catch (error) {
      throw this.notSubmitted(error)
    }
    return new AlipayMerchantTransferAdapter(gateway).create({
      businessNo: verified.order.paymentNo,
      amount: verified.order.amount,
      payeeIdentity: verified.order.payeeIdentity,
      payeeName: verified.order.payeeName,
    })
  }

  async query(order: ExecutablePaymentOrder): Promise<PaymentExecutionResult> {
    const context = await this.preflight.loadContext(order.tenantId, order.id)
    const gateway = await this.createGateway(context.account.credentialRef)
    return new AlipayMerchantTransferAdapter(gateway).query(context.order.paymentNo)
  }

  private createGateway(reference: string) {
    return this.gateways.create(reference)
  }

  private notSubmitted(error: unknown): PaymentNotSubmittedError {
    return error instanceof PaymentNotSubmittedError
      ? error
      : new PaymentNotSubmittedError(error instanceof Error ? error.message : String(error))
  }
}
