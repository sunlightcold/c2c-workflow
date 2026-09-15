import type { AlipayGateway } from './payment-adapter.types'

type AlipayReceiptStatus = 'INIT' | 'PROCESS' | 'SUCCESS' | 'FAIL'

interface AlipayReceiptResponse {
  code: string
  msg?: string
  subCode?: string
  subMsg?: string
}

interface AlipayReceiptApplyResponse extends AlipayReceiptResponse {
  fileId?: string
}

interface AlipayReceiptQueryResponse extends AlipayReceiptResponse {
  status?: AlipayReceiptStatus
  downloadUrl?: string
  errorMessage?: string
}

export interface AlipayReceiptQueryResult {
  status: AlipayReceiptStatus
  downloadUrl?: string
  errorMessage?: string
}

export class AlipayReceiptAdapter {
  constructor(private readonly gateway: AlipayGateway) {}

  async apply(detailId: string): Promise<string> {
    const response = await this.gateway.execute<AlipayReceiptApplyResponse>(
      'alipay.data.bill.ereceipt.apply',
      { type: 'FUND_DETAIL', key: detailId },
    )
    this.assertSuccess(response, '回单申请失败')
    if (!response.fileId?.trim()) throw new Error('回单申请未返回文件申请号')
    return response.fileId.trim()
  }

  async query(fileId: string): Promise<AlipayReceiptQueryResult> {
    const response = await this.gateway.execute<AlipayReceiptQueryResponse>(
      'alipay.data.bill.ereceipt.query',
      { file_id: fileId },
    )
    this.assertSuccess(response, '回单查询失败')
    if (!response.status || !['INIT', 'PROCESS', 'SUCCESS', 'FAIL'].includes(response.status)) {
      throw new Error('回单查询返回未知状态')
    }
    if (response.status === 'SUCCESS') {
      const downloadUrl = this.httpUrl(response.downloadUrl)
      if (!downloadUrl) throw new Error('回单查询成功但未返回有效下载地址')
      return { status: response.status, downloadUrl }
    }
    return {
      status: response.status,
      errorMessage: response.errorMessage ?? response.subMsg ?? response.msg,
    }
  }

  private assertSuccess(response: AlipayReceiptResponse, action: string): void {
    if (response.code === '10000') return
    const reason = response.subMsg ?? response.msg ?? '支付宝接口请求失败'
    throw new Error(`${action}：${reason}`)
  }

  private httpUrl(value: string | undefined): string | undefined {
    if (!value?.trim()) return undefined
    try {
      const url = new URL(value.trim())
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
    } catch {
      return undefined
    }
  }
}
