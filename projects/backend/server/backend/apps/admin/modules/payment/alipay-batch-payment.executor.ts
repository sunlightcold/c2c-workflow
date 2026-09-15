import { Inject, Injectable } from '@nestjs/common'
import { PaymentAdapterCode } from '@admin/database'
import type {
  ExecutablePaymentBatch,
  PaymentBatchExecutor,
} from './payment-batch-execution-coordinator'
import { PaymentNotSubmittedError } from './payment-execution.errors'
import {
  PAYMENT_CHANNEL_CAPABILITY_FACTORY,
  type PaymentChannelCapabilityFactory,
} from './payment-channel-capability.factory'

@Injectable()
export class AlipayBatchPaymentExecutor implements PaymentBatchExecutor {
  constructor(
    @Inject(PAYMENT_CHANNEL_CAPABILITY_FACTORY)
    private readonly channels: PaymentChannelCapabilityFactory,
  ) {}

  async submit(batch: ExecutablePaymentBatch) {
    let gateway
    try {
      gateway = await this.channels.create(PaymentAdapterCode.ALIPAY_BATCH, batch.credentialRef)
    } catch (error) {
      throw new PaymentNotSubmittedError(this.errorMessage(error))
    }
    return gateway.batch.create({
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
    const channel = await this.channels.create(PaymentAdapterCode.ALIPAY_BATCH, batch.credentialRef)
    return channel.batch.query(batch.batchNo)
  }

  getReconciliationPolicy() {
    return this.channels.getReconciliationPolicies(PaymentAdapterCode.ALIPAY_BATCH).batch
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
