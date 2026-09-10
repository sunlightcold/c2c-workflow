import { Inject, Injectable } from '@nestjs/common'
import {
  ALIPAY_GATEWAY,
  type AlipayGateway,
  type AlipayPayee,
  normalizeCnyAmount,
  PaymentExecutionStatus,
  type PaymentExecutionResult,
} from './payment-adapter.types'

type TransferStatus = 'DEALING' | 'SUCCESS' | 'FAIL' | 'WAIT_PAY' | 'CLOSED' | 'REFUND'

interface TransferResponse {
  code: string
  msg?: string
  subCode?: string
  subMsg?: string
  outBizNo?: string
  orderId?: string
  status?: TransferStatus
  transAmount?: string
}

@Injectable()
export class AlipayMerchantTransferAdapter {
  constructor(@Inject(ALIPAY_GATEWAY) private readonly gateway: AlipayGateway) {}

  async create(
    input: AlipayPayee & { businessNo: string },
  ): Promise<PaymentExecutionResult<TransferResponse>> {
    const response = await this.gateway.execute<TransferResponse>(
      'alipay.fund.trans.uni.transfer',
      {
        out_biz_no: input.businessNo,
        trans_amount: normalizeCnyAmount(input.amount),
        product_code: 'TRANS_ACCOUNT_NO_PWD',
        biz_scene: 'DIRECT_TRANSFER',
        payee_info: {
          identity_type: 'ALIPAY_LOGON_ID',
          identity: input.payeeIdentity,
          name: input.payeeName,
        },
        order_title: '转账',
      },
    )
    if (response.outBizNo && response.outBizNo !== input.businessNo)
      throw new Error('支付宝商家转账返回的业务单号不匹配')
    return this.mapCreateResponse(response)
  }

  async query(businessNo: string): Promise<PaymentExecutionResult<TransferResponse>> {
    const response = await this.gateway.execute<TransferResponse>(
      'alipay.fund.trans.common.query',
      {
        out_biz_no: businessNo,
        product_code: 'TRANS_ACCOUNT_NO_PWD',
        biz_scene: 'DIRECT_TRANSFER',
      },
    )
    if (response.outBizNo && response.outBizNo !== businessNo)
      throw new Error('支付宝商家转账查询返回的业务单号不匹配')
    return this.mapQueryResponse(response)
  }

  private mapCreateResponse(response: TransferResponse): PaymentExecutionResult<TransferResponse> {
    if (response.code !== '10000') {
      return {
        status: PaymentExecutionStatus.FAILED,
        errorMessage: response.subMsg ?? response.msg ?? '支付宝商家转账请求失败',
        raw: response,
      }
    }
    return this.mapSuccessfulResponse(response)
  }

  private mapQueryResponse(response: TransferResponse): PaymentExecutionResult<TransferResponse> {
    if (response.subCode === 'ORDER_NOT_EXIST' && response.code === '40004') {
      return { status: PaymentExecutionStatus.FAILED, errorMessage: response.subMsg, raw: response }
    }
    if (response.code !== '10000') {
      return {
        status: PaymentExecutionStatus.UNKNOWN,
        errorMessage: response.subMsg ?? response.msg ?? '支付宝商家转账查询结果未知',
        raw: response,
      }
    }
    return this.mapSuccessfulResponse(response)
  }

  private mapSuccessfulResponse(
    response: TransferResponse,
  ): PaymentExecutionResult<TransferResponse> {
    const statuses: Partial<Record<TransferStatus, PaymentExecutionStatus>> = {
      DEALING: PaymentExecutionStatus.PROCESSING,
      WAIT_PAY: PaymentExecutionStatus.PROCESSING,
      SUCCESS: PaymentExecutionStatus.SUCCESS,
      FAIL: PaymentExecutionStatus.FAILED,
      CLOSED: PaymentExecutionStatus.FAILED,
      REFUND: PaymentExecutionStatus.FAILED,
    }
    return {
      status: response.status
        ? (statuses[response.status] ?? PaymentExecutionStatus.UNKNOWN)
        : PaymentExecutionStatus.UNKNOWN,
      upstreamId: response.orderId,
      raw: response,
    }
  }
}
