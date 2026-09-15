import { Inject, Injectable } from '@nestjs/common'
import {
  ALIPAY_GATEWAY,
  type AlipayGateway,
  normalizeCnyAmount,
  PaymentExecutionStatus,
  type PaymentExecutionResult,
  type PaymentReconciliationPolicy,
  sumCnyAmounts,
} from './payment-adapter.types'

export type AlipayBatchStatus =
  | 'INIT'
  | 'WAIT_PAY'
  | 'DEALING'
  | 'SUCCESS'
  | 'PART_SUCCESS'
  | 'FAIL'
  | 'INVALID'
  | 'DISUSE'

export type AlipayBatchDetailStatus = 'INIT' | 'WAIT_PAY' | 'DEALING' | 'SUCCESS' | 'FAIL'

export interface AlipayBatchDetail {
  outBizNo: string
  detailId: string
  alipayOrderNo?: string
  status: AlipayBatchDetailStatus
  transAmount: string
  errorCode?: string
  errorMsg?: string
}

export interface AlipayBatchResponse {
  code: string
  msg?: string
  subCode?: string
  subMsg?: string
  outBatchNo?: string
  batchTransId?: string
  status?: AlipayBatchStatus
  batchStatus?: AlipayBatchStatus
  totalAmount?: string
  totalItemCount?: number
  totalPageCount?: number
  accDetailList?: AlipayBatchDetail[]
}

export const ALIPAY_BATCH_RECONCILIATION_POLICY: PaymentReconciliationPolicy = {
  enabled: true,
  initialDelaySeconds: 10,
  intervalSeconds: 5,
  maxAttempts: 12,
}

@Injectable()
export class AlipayBatchAdapter {
  constructor(@Inject(ALIPAY_GATEWAY) private readonly gateway: AlipayGateway) {}

  getReconciliationPolicy(): PaymentReconciliationPolicy {
    return { ...ALIPAY_BATCH_RECONCILIATION_POLICY }
  }

  async create(input: {
    batchNo: string
    items: Array<{
      businessNo: string
      amount: string
      payeeIdentity: string
      payeeName: string
    }>
  }): Promise<PaymentExecutionResult<AlipayBatchResponse>> {
    if (!input.items.length) throw new Error('支付批次不能为空')
    const response = await this.gateway.execute<AlipayBatchResponse>('alipay.fund.batch.create', {
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
    if (response.code === '10000') {
      if (response.outBatchNo !== input.batchNo)
        throw new Error('支付宝批次创建返回的业务单号不匹配')
      if (!response.batchTransId) throw new Error('支付宝批次创建未返回批次流水号')
    }
    return this.mapCreateResponse(response)
  }

  async query(batchNo: string): Promise<PaymentExecutionResult<AlipayBatchResponse>> {
    const details: AlipayBatchDetail[] = []
    let pageNum = 1
    let response: AlipayBatchResponse
    while (true) {
      response = await this.gateway.execute<AlipayBatchResponse>('alipay.fund.batch.detail.query', {
        out_batch_no: batchNo,
        product_code: 'BATCH_PAY_V2',
        biz_scene: 'MESSAGE_BATCH_PAY',
        page_num: pageNum,
        page_size: 100,
      })
      if (response.code !== '10000') return this.mapQueryError(response)
      if (response.outBatchNo !== batchNo) throw new Error('支付宝批次查询返回的业务单号不匹配')
      details.push(...(response.accDetailList ?? []))
      const totalPageCount = Number(response.totalPageCount)
      if (!Number.isSafeInteger(totalPageCount) || totalPageCount <= pageNum) break
      if (totalPageCount > 1000) throw new Error('支付宝批次查询页数超过系统限制')
      pageNum += 1
    }
    const merged = { ...response, accDetailList: details }
    return this.mapSuccessfulResponse(merged, response.batchStatus)
  }

  private mapCreateResponse(
    response: AlipayBatchResponse,
  ): PaymentExecutionResult<AlipayBatchResponse> {
    if (response.code !== '10000') {
      return {
        status: PaymentExecutionStatus.FAILED,
        errorMessage: response.subMsg ?? response.msg ?? '支付宝批次请求失败',
        raw: response,
      }
    }
    return this.mapSuccessfulResponse(response, response.status)
  }

  private mapQueryError(
    response: AlipayBatchResponse,
  ): PaymentExecutionResult<AlipayBatchResponse> {
    return {
      status: PaymentExecutionStatus.UNKNOWN,
      errorMessage: response.subMsg ?? response.msg ?? '支付宝批次查询结果未知',
      raw: response,
    }
  }

  private mapSuccessfulResponse(
    response: AlipayBatchResponse,
    status?: AlipayBatchStatus,
  ): PaymentExecutionResult<AlipayBatchResponse> {
    const mapped: Record<AlipayBatchStatus, PaymentExecutionStatus> = {
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
