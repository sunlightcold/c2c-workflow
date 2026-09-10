import { Inject, Injectable } from '@nestjs/common'
import {
  ALIPAY_ACCOUNT_GATEWAY_FACTORY,
  type AlipayAccountGatewayFactory,
} from './alipay-account-gateway.provider'
import { AlipayBatchAdapter } from './alipay-batch.adapter'
import type {
  ExecutablePaymentBatch,
  PaymentBatchExecutor,
} from './payment-batch-execution-coordinator'
import { PaymentNotSubmittedError } from './payment-execution.errors'

@Injectable()
export class AlipayBatchPaymentExecutor implements PaymentBatchExecutor {
  constructor(
    @Inject(ALIPAY_ACCOUNT_GATEWAY_FACTORY)
    private readonly gateways: AlipayAccountGatewayFactory,
  ) {}

  async submit(batch: ExecutablePaymentBatch) {
    let gateway
    try {
      gateway = await this.gateways.create(batch.credentialRef)
    } catch (error) {
      throw new PaymentNotSubmittedError(this.errorMessage(error))
    }
    return new AlipayBatchAdapter(gateway).create({
      batchNo: batch.batchNo,
      items: batch.items.map((item) => ({
        businessNo: item.paymentNo,
        amount: item.amount,
        payeeIdentity: item.payeeIdentity,
        payeeName: item.payeeName,
      })),
    })
  }

  async query(batch: ExecutablePaymentBatch) {
    const gateway = await this.gateways.create(batch.credentialRef)
    return new AlipayBatchAdapter(gateway).query(batch.batchNo)
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
