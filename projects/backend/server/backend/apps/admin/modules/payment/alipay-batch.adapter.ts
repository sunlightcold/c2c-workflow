import { Inject, Injectable } from '@nestjs/common'
import {
  ALIPAY_GATEWAY,
  type AlipayGateway,
  normalizeCnyAmount,
  PaymentExecutionStatus,
  type PaymentExecutionResult,
  sumCnyAmounts,
} from './payment-adapter.types'

type BatchStatus =
  | 'INIT'
  | 'WAIT_PAY'
  | 'DEALING'
  | 'SUCCESS'
  | 'PART_SUCCESS'
  | 'FAIL'
  | 'INVALID'
  | 'DISUSE'

interface BatchResponse {
  code: string
  msg?: string
  subMsg?: string
  outBatchNo: string
  batchTransId?: string
  status?: BatchStatus
  batchStatus?: BatchStatus
}

@Injectable()
export class AlipayBatchAdapter {
  constructor(@Inject(ALIPAY_GATEWAY) private readonly gateway: AlipayGateway) {}

  async create(input: {
    batchNo: string
    items: Array<{
      businessNo: string
      amount: string
      payeeIdentity: string
      payeeName: string
    }>
  }): Promise<PaymentExecutionResult<BatchResponse>> {
    if (!input.items.length) throw new Error('支付批次不能为空')
    const response = await this.gateway.execute<BatchResponse>('alipay.fund.batch.create', {
      out_batch_no: input.batchNo,
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      order_title: '转账',
      total_trans_amount: sumCnyAmounts(input.items.map(({ amount }) => amount)),
      total_count: String(input.items.length),
      trans_order_list: input.items.map((item) => ({
        out_biz_no: item.businessNo,
        order_title: '转账',
        trans_amount: normalizeCnyAmount(item.amount),
        payee_info: {
          identity: item.payeeIdentity,
          identity_type: 'ALIPAY_LOGON_ID',
          name: item.payeeName,
        },
      })),
    })
    return this.mapResponse(response, response.status)
  }

  async query(batchNo: string): Promise<PaymentExecutionResult<BatchResponse>> {
    const response = await this.gateway.execute<BatchResponse>('alipay.fund.batch.detail.query', {
      out_batch_no: batchNo,
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 500,
    })
    if (response.outBatchNo !== batchNo) throw new Error('支付宝批次查询返回的业务单号不匹配')
    return this.mapResponse(response, response.batchStatus)
  }

  private mapResponse(
    response: BatchResponse,
    status?: BatchStatus,
  ): PaymentExecutionResult<BatchResponse> {
    if (response.code !== '10000') {
      return {
        status: PaymentExecutionStatus.FAILED,
        errorMessage: response.subMsg ?? response.msg ?? '支付宝批次请求失败',
        raw: response,
      }
    }
    const mapped: Record<BatchStatus, PaymentExecutionStatus> = {
      INIT: PaymentExecutionStatus.PROCESSING,
      WAIT_PAY: PaymentExecutionStatus.PROCESSING,
      DEALING: PaymentExecutionStatus.PROCESSING,
      PART_SUCCESS: PaymentExecutionStatus.PROCESSING,
      SUCCESS: PaymentExecutionStatus.SUCCESS,
      FAIL: PaymentExecutionStatus.FAILED,
      INVALID: PaymentExecutionStatus.FAILED,
      DISUSE: PaymentExecutionStatus.FAILED,
    }
    return {
      status: status ? mapped[status] : PaymentExecutionStatus.UNKNOWN,
      upstreamId: response.batchTransId,
      raw: response,
    }
  }
}
