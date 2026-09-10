import { randomUUID } from 'node:crypto'
import type { MockGatewayRequest, MockGatewayResponse, UpstreamMockPlugin } from '@mock/core/contracts'
import { canonicalize, signRsa2, verifyRsa2 } from './crypto'
import { AlipayApiError, invalidArgument } from './errors'
import { getAlipayTestKeys } from './key-store'
import { getAlipayBatchState } from './state'
import {
  ALIPAY_BATCH_METHODS,
  type AlipayBatchDetailStatus,
  type AlipayBatchOrder,
  type AlipayBatchOrderDetail,
  type AlipayBatchRunOutcome,
  type AlipayBatchSettings,
  type AlipayBatchStatus,
} from './types'

const APP_ID = process.env.MOCK_ALIPAY_APP_ID ?? '2026000000000001'

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidArgument(`${field}格式错误`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw invalidArgument(`${field}不能为空`)
  return value
}

function randomInteger(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function wait(milliseconds: number) {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve()
}

function amount(value: unknown, field: string) {
  const text = requiredString(value, field)
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) throw invalidArgument(`${field}金额错误`)
  const [integer, decimal = ''] = text.split('.')
  return `${integer.replace(/^0+(?=\d)/, '')}.${decimal.padEnd(2, '0')}`
}

function amountInCents(value: string) {
  const [integer, decimal] = value.split('.')
  return `${integer}${decimal}`.replace(/^0+(?=\d)/, '')
}

function addIntegerStrings(left: string, right: string) {
  let carry = 0
  let result = ''
  for (let leftIndex = left.length - 1, rightIndex = right.length - 1; leftIndex >= 0 || rightIndex >= 0; ) {
    const sum = Number(left[leftIndex--] ?? 0) + Number(right[rightIndex--] ?? 0) + carry
    result = `${sum % 10}${result}`
    carry = Math.floor(sum / 10)
  }
  return `${carry || ''}${result}`.replace(/^0+(?=\d)/, '')
}

function positiveInteger(value: unknown, field: string) {
  const text = requiredString(value, field)
  if (!/^[1-9]\d*$/.test(text)) throw invalidArgument(`${field}必须是正整数字符串`)
  const result = Number(text)
  if (!Number.isSafeInteger(result)) throw invalidArgument(`${field}超出支持范围`)
  return result
}

function inferDetailStatus(status: AlipayBatchStatus): AlipayBatchDetailStatus {
  if (status === 'SUCCESS') return 'SUCCESS'
  if (status === 'FAIL' || status === 'INVALID' || status === 'DISUSE') return 'FAIL'
  if (status === 'WAIT_PAY') return 'WAIT_PAY'
  if (status === 'INIT') return 'INIT'
  return 'DEALING'
}

function isPendingStatus(status: AlipayBatchStatus) {
  return status === 'INIT' || status === 'WAIT_PAY' || status === 'DEALING'
}

function summarizeBatchStatus(details: AlipayBatchOrderDetail[]): AlipayBatchStatus {
  const successCount = details.filter((detail) => detail.detailStatus === 'SUCCESS').length
  const failCount = details.filter((detail) => detail.detailStatus === 'FAIL').length
  if (successCount === details.length) return 'SUCCESS'
  if (failCount === details.length) return 'FAIL'
  if (successCount + failCount === details.length) return 'PART_SUCCESS'
  return 'DEALING'
}

const RANDOM_FAILURE_CODE = 'MOCK_RANDOM_FAILURE'
const RANDOM_FAILURE_MESSAGE = 'Mock随机模拟订单失败'

function advanceDetails(details: AlipayBatchOrderDetail[], settings: AlipayBatchSettings) {
  if (
    settings.randomDetailFailRate === 0 ||
    settings.autoAdvanceBatchStatus !== 'SUCCESS' ||
    settings.autoAdvanceDetailStatus !== 'SUCCESS'
  ) {
    return {
      batchStatus: settings.autoAdvanceBatchStatus,
      details: details.map((detail) => ({ ...detail, detailStatus: settings.autoAdvanceDetailStatus })),
    }
  }

  const randomized = details.map((detail) => {
    const failed = Math.random() * 100 < settings.randomDetailFailRate
    return failed
      ? {
          ...detail,
          detailStatus: 'FAIL' as const,
          errorCode: RANDOM_FAILURE_CODE,
          errorMsg: RANDOM_FAILURE_MESSAGE,
        }
      : { ...detail, detailStatus: 'SUCCESS' as const, errorCode: undefined, errorMsg: undefined }
  })
  if (randomized.length > 1 && !randomized.some((detail) => detail.detailStatus === 'FAIL')) {
    const failedIndex = Math.floor(Math.random() * randomized.length)
    randomized[failedIndex] = {
      ...randomized[failedIndex],
      detailStatus: 'FAIL',
      errorCode: RANDOM_FAILURE_CODE,
      errorMsg: RANDOM_FAILURE_MESSAGE,
    }
  }
  const failedCount = randomized.filter((detail) => detail.detailStatus === 'FAIL').length
  return {
    batchStatus: failedCount === randomized.length ? ('FAIL' as const) : ('PART_SUCCESS' as const),
    details: randomized,
  }
}

export class AlipayBatchPlugin implements UpstreamMockPlugin {
  readonly id = 'alipay-batch'
  readonly methods = Object.values(ALIPAY_BATCH_METHODS)
  private readonly state = getAlipayBatchState()

  async handle(request: MockGatewayRequest): Promise<MockGatewayResponse> {
    const traceId = randomUUID().replaceAll('-', '')
    try {
      await this.verifyRequest(request.params)
      const bizContent = this.parseBizContent(request.params.biz_content)
      let data: Record<string, unknown>
      if (request.method === ALIPAY_BATCH_METHODS.create) {
        data = this.createOrder(bizContent)
        this.scheduleNotify(String(data.out_batch_no), request.params.notify_url || request.params.notifyUrl)
      } else if (request.method === ALIPAY_BATCH_METHODS.detailQuery) data = this.queryOrder(bizContent)
      else if (request.method === ALIPAY_BATCH_METHODS.close) data = this.closeOrder(bizContent)
      else if (request.method === ALIPAY_BATCH_METHODS.balance) data = this.queryBalance(bizContent)
      else if (request.method === ALIPAY_BATCH_METHODS.receiptApply) data = this.applyReceipt(bizContent)
      else if (request.method === ALIPAY_BATCH_METHODS.receiptQuery)
        data = this.queryReceipt(bizContent, request.origin)
      else throw new AlipayApiError('40004', 'isv.invalid-method', 'Business Failed', '不支持的接口方法')
      return this.response(request.method, data, traceId)
    } catch (error) {
      const apiError =
        error instanceof AlipayApiError
          ? error
          : new AlipayApiError('40004', 'mock.internal-error', 'Business Failed', (error as Error).message)
      return this.response(
        'error',
        {
          code: apiError.code,
          msg: apiError.message,
          sub_code: apiError.subCode,
          sub_msg: apiError.subMessage,
        },
        traceId,
      )
    }
  }

  private async verifyRequest(params: Record<string, string>) {
    if (params.app_id !== APP_ID) throw invalidArgument('app_id不匹配')
    if (params.sign_type !== 'RSA2') throw invalidArgument('只支持RSA2签名')
    if (!params.sign) throw invalidArgument('缺少sign')
    if (!this.state.getSettings().verifyRequestSign) return
    const keys = await getAlipayTestKeys()
    if (!verifyRsa2(canonicalize(params), params.sign, keys.appPublicKey)) {
      throw new AlipayApiError('40002', 'isv.invalid-signature', 'Invalid Arguments', '请求验签失败')
    }
  }

  private parseBizContent(raw: string | undefined) {
    if (!raw) throw invalidArgument('缺少biz_content')
    try {
      return asObject(JSON.parse(raw), 'biz_content')
    } catch (error) {
      if (error instanceof AlipayApiError) throw error
      throw invalidArgument('biz_content不是有效JSON')
    }
  }

  private createOrder(body: Record<string, unknown>) {
    const outBatchNo = requiredString(body.out_batch_no, 'out_batch_no')
    this.assertProduct(body)
    if (this.state.orders.find(outBatchNo)) {
      throw new AlipayApiError('40004', 'isv.out-batch-no-duplicate', 'Business Failed', 'out_batch_no重复')
    }

    const totalAmount = amount(body.total_trans_amount, 'total_trans_amount')
    const totalCount = positiveInteger(body.total_count, 'total_count')
    if (!Array.isArray(body.trans_order_list) || body.trans_order_list.length !== totalCount) {
      throw invalidArgument('total_count与trans_order_list明细数量不一致')
    }
    const settings = this.state.getSettings()
    const outBizNos = new Set<string>()
    const details = body.trans_order_list.map((item, index): AlipayBatchOrderDetail => {
      const detail = asObject(item, `trans_order_list[${index}]`)
      const outBizNo = requiredString(detail.out_biz_no, `trans_order_list[${index}].out_biz_no`)
      if (outBizNos.has(outBizNo)) throw invalidArgument(`trans_order_list[${index}].out_biz_no重复`)
      outBizNos.add(outBizNo)
      const payee = asObject(detail.payee_info, `trans_order_list[${index}].payee_info`)
      const orderTitle = requiredString(detail.order_title, `trans_order_list[${index}].order_title`)
      return {
        outBizNo,
        detailId: `D${randomUUID().replaceAll('-', '')}`,
        alipayOrderNo: `2026${Date.now()}${Math.floor(Math.random() * 1000000)
          .toString()
          .padStart(6, '0')}`,
        amount: amount(detail.trans_amount, `trans_order_list[${index}].trans_amount`),
        orderTitle,
        remark: typeof detail.remark === 'string' && detail.remark.trim() ? detail.remark : orderTitle,
        payeeIdentity: requiredString(payee.identity, `trans_order_list[${index}].payee_info.identity`),
        payeeIdentityType: requiredString(payee.identity_type, `trans_order_list[${index}].payee_info.identity_type`),
        payeeName: requiredString(payee.name, `trans_order_list[${index}].payee_info.name`),
        detailStatus: settings.createDetailStatus,
      }
    })
    const detailTotal = details.reduce((sum, detail) => addIntegerStrings(sum, amountInCents(detail.amount)), '0')
    if (detailTotal !== amountInCents(totalAmount)) throw invalidArgument('批次总金额与明细金额合计不一致')

    const now = new Date().toISOString()
    const orderTitle = requiredString(body.order_title, 'order_title')
    const order: AlipayBatchOrder = {
      id: outBatchNo,
      outBatchNo,
      batchTransId: `2026${Date.now()}${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0')}`,
      amount: totalAmount,
      orderTitle,
      remark: typeof body.remark === 'string' && body.remark.trim() ? body.remark : orderTitle,
      details,
      batchStatus: settings.createBatchStatus,
      queryCount: 0,
      notifyCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.state.orders.insert(order)
    return {
      code: '10000',
      msg: 'Success',
      out_batch_no: order.outBatchNo,
      batch_trans_id: order.batchTransId,
      status: order.batchStatus,
    }
  }

  private queryOrder(body: Record<string, unknown>) {
    this.assertProduct(body)
    const outBatchNo = requiredString(body.out_batch_no, 'out_batch_no')
    const existing = this.state.orders.find(outBatchNo)
    if (!existing) throw new AlipayApiError('40004', 'isv.order-not-exist', 'Business Failed', '订单不存在')

    const settings = this.state.getSettings()
    const order = this.state.orders.update(outBatchNo, (current) => {
      const queryCount = current.queryCount + 1
      const plannedOutcomes = new Map(
        this.state.runs
          .list()
          .flatMap((plan) => plan.outcomes)
          .filter((outcome) => current.details.some((detail) => detail.outBizNo === outcome.outBizNo))
          .map((outcome) => [outcome.outBizNo, outcome]),
      )
      const plannedDetails = plannedOutcomes.size
        ? current.details.map((detail) => {
            const outcome = plannedOutcomes.get(detail.outBizNo)
            return outcome
              ? {
                  ...detail,
                  detailStatus: outcome.status,
                  errorCode: outcome.status === 'FAIL' ? outcome.errorCode : undefined,
                  errorMsg: outcome.status === 'FAIL' ? outcome.errorMsg : undefined,
                }
              : detail
          })
        : undefined
      const shouldAdvance =
        !plannedDetails &&
        isPendingStatus(current.batchStatus) &&
        settings.autoAdvanceAfterQueries > 0 &&
        queryCount >= settings.autoAdvanceAfterQueries
      const advanced = shouldAdvance ? advanceDetails(current.details, settings) : undefined
      return {
        ...current,
        queryCount,
        batchStatus: plannedDetails
          ? summarizeBatchStatus(plannedDetails)
          : (advanced?.batchStatus ?? current.batchStatus),
        details: plannedDetails ?? advanced?.details ?? current.details,
        updatedAt: new Date().toISOString(),
      }
    })!
    if (existing.batchStatus !== order.batchStatus && !isPendingStatus(order.batchStatus)) {
      this.scheduleNotify(order.outBatchNo)
    }

    return {
      code: '10000',
      msg: 'Success',
      out_batch_no: order.outBatchNo,
      batch_trans_id: order.batchTransId,
      batch_status: order.batchStatus,
      total_amount: order.amount,
      total_count: String(order.details.length),
      acc_detail_list: order.details.map((detail) => ({
        out_biz_no: detail.outBizNo,
        detail_id: detail.detailId,
        alipay_order_no: detail.alipayOrderNo,
        status: detail.detailStatus,
        trans_amount: detail.amount,
        remark: detail.remark,
        ...(detail.errorCode ? { error_code: detail.errorCode } : {}),
        ...(detail.errorMsg ? { error_msg: detail.errorMsg } : {}),
      })),
    }
  }

  private closeOrder(body: Record<string, unknown>) {
    this.assertProduct(body)
    const outBatchNo = typeof body.out_batch_no === 'string' && body.out_batch_no.trim() ? body.out_batch_no : undefined
    const batchTransId =
      typeof body.batch_trans_id === 'string' && body.batch_trans_id.trim() ? body.batch_trans_id : undefined
    if (!outBatchNo && !batchTransId) throw invalidArgument('out_batch_no和batch_trans_id不能同时为空')
    const existing = outBatchNo
      ? this.state.orders.find(outBatchNo)
      : this.state.orders.list().find((order) => order.batchTransId === batchTransId)
    if (!existing) throw new AlipayApiError('40004', 'isv.order-not-exist', 'Business Failed', '订单不存在')
    if (existing.batchStatus === 'DISUSE') {
      return {
        code: '10000',
        msg: 'Success',
        batch_trans_id: existing.batchTransId,
        status: existing.batchStatus,
      }
    }
    if (existing.batchStatus !== 'INIT' && existing.batchStatus !== 'WAIT_PAY') {
      throw new AlipayApiError('40004', 'isv.batch-status-error', 'Business Failed', '当前批次状态不允许关单')
    }
    const closed = this.state.orders.update(existing.outBatchNo, (order) => ({
      ...order,
      batchStatus: 'DISUSE',
      details: order.details.map((detail) => ({
        ...detail,
        detailStatus: 'FAIL',
        errorCode: 'BATCH_CLOSED',
        errorMsg: '批次已关闭',
      })),
      updatedAt: new Date().toISOString(),
    }))!
    this.scheduleNotify(closed.outBatchNo, undefined, ALIPAY_BATCH_METHODS.close)
    return {
      code: '10000',
      msg: 'Success',
      batch_trans_id: closed.batchTransId,
      status: closed.batchStatus,
    }
  }

  private queryBalance(body: Record<string, unknown>) {
    if (body.account_type !== 'ACCTRANS_ACCOUNT') throw invalidArgument('account_type错误')
    requiredString(body.alipay_user_id, 'alipay_user_id')
    const settings = this.state.getSettings()
    return {
      code: '10000',
      msg: 'Success',
      available_amount: settings.availableAmount,
      freeze_amount: settings.freezeAmount,
    }
  }

  private applyReceipt(body: Record<string, unknown>) {
    if (body.type !== 'FUND_DETAIL') throw invalidArgument('type仅支持FUND_DETAIL')
    const detailId = requiredString(body.key, 'key')
    if (body.bill_user_id !== undefined) requiredString(body.bill_user_id, 'bill_user_id')
    const detail = this.state.orders
      .list()
      .flatMap((item) => item.details)
      .find((item) => item.detailId === detailId)
    if (!detail) throw new AlipayApiError('40004', 'isv.fund-order-not-exist', 'Business Failed', '资金单据不存在')
    if (detail.detailStatus !== 'SUCCESS') {
      throw new AlipayApiError('40004', 'isv.fund-order-not-success', 'Business Failed', '资金单据未成功')
    }

    const now = new Date().toISOString()
    const fileId = randomUUID().replaceAll('-', '')
    this.state.receipts.insert({
      id: fileId,
      fileId,
      detailId,
      status: 'INIT',
      queryCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    return {
      code: '10000',
      msg: 'Success',
      file_id: fileId,
    }
  }

  private queryReceipt(body: Record<string, unknown>, origin?: string) {
    const fileId = requiredString(body.file_id, 'file_id')
    const current = this.state.receipts.find(fileId)
    if (!current) throw new AlipayApiError('40004', 'isv.file-id-not-exist', 'Business Failed', '文件申请号不存在')
    const settings = this.state.getSettings()
    const receipt = this.state.receipts.update(fileId, (record) => {
      const queryCount = record.queryCount + 1
      const ready = queryCount >= settings.receiptReadyAfterQueries
      return {
        ...record,
        queryCount,
        status: ready ? settings.receiptFinalStatus : 'PROCESS',
        errorMessage: ready && settings.receiptFinalStatus === 'FAIL' ? settings.receiptErrorMessage : undefined,
        updatedAt: new Date().toISOString(),
      }
    })!
    const publicOrigin = (origin ?? process.env.MOCK_PUBLIC_ORIGIN ?? 'http://127.0.0.1:3002').replace(/\/$/, '')
    return {
      code: '10000',
      msg: 'Success',
      status: receipt.status,
      ...(receipt.status === 'SUCCESS'
        ? { download_url: `${publicOrigin}/api/mock/alipay-batch/receipts/${receipt.fileId}` }
        : {}),
      ...(receipt.errorMessage ? { error_message: receipt.errorMessage } : {}),
    }
  }

  private assertProduct(body: Record<string, unknown>) {
    if (body.product_code !== 'BATCH_PAY_V2' || body.biz_scene !== 'MESSAGE_BATCH_PAY') {
      throw invalidArgument('仅支持BATCH_PAY_V2 + MESSAGE_BATCH_PAY')
    }
  }

  private async response(method: string, data: Record<string, unknown>, traceId: string) {
    const keys = await getAlipayTestKeys()
    const responseKey = method === 'error' ? 'error_response' : `${method.replaceAll('.', '_')}_response`
    return {
      status: 200,
      headers: { trace_id: traceId, 'content-type': 'application/json; charset=utf-8' },
      body: {
        [responseKey]: data,
        sign: signRsa2(JSON.stringify(data), keys.alipayPrivateKey),
      },
    }
  }

  private scheduleNotify(
    outBatchNo: string,
    notifyUrl?: string,
    originInterface: string = ALIPAY_BATCH_METHODS.create,
  ) {
    if (!(notifyUrl || this.state.getSettings().notifyUrl)) return
    void Promise.resolve()
      .then(() => this.sendNotify(outBatchNo, notifyUrl, originInterface))
      .catch((error) => {
        this.state.orders.update(outBatchNo, (current) => ({
          ...current,
          notifyCount: current.notifyCount + 1,
          lastNotifyResult: `error:${error instanceof Error ? error.message : '通知失败'}`,
          updatedAt: new Date().toISOString(),
        }))
      })
  }

  updateOrderStatus(
    outBatchNo: string,
    patch: {
      batchStatus: AlipayBatchStatus
      detailStatus?: AlipayBatchDetailStatus
      errorCode?: string
      errorMsg?: string
      details?: Array<{
        outBizNo: string
        detailStatus: AlipayBatchDetailStatus
        errorCode?: string
        errorMsg?: string
      }>
    },
  ) {
    return this.state.orders.update(outBatchNo, (order) => {
      const unknownDetail = patch.details?.find(
        (detailPatch) => !order.details.some((detail) => detail.outBizNo === detailPatch.outBizNo),
      )
      if (unknownDetail) throw new Error(`批次中不存在明细订单${unknownDetail.outBizNo}`)
      return {
        ...order,
        batchStatus: patch.batchStatus,
        details: order.details.map((detail) => {
          const detailPatch = patch.details?.find((item) => item.outBizNo === detail.outBizNo)
          return {
            ...detail,
            detailStatus: detailPatch?.detailStatus ?? patch.detailStatus ?? inferDetailStatus(patch.batchStatus),
            errorCode: detailPatch?.errorCode ?? patch.errorCode,
            errorMsg: detailPatch?.errorMsg ?? patch.errorMsg,
          }
        }),
        updatedAt: new Date().toISOString(),
      }
    })
  }

  upsertRunPlan(runId: string, outcomes: AlipayBatchRunOutcome[]) {
    const now = new Date().toISOString()
    const existing = this.state.runs.find(runId)
    if (existing) {
      return this.state.runs.update(runId, (plan) => ({ ...plan, outcomes, updatedAt: now }))!
    }
    return this.state.runs.insert({ id: runId, runId, outcomes, createdAt: now, updatedAt: now })
  }

  getRunSummary(runId: string) {
    const plan = this.state.runs.find(runId)
    if (!plan) return undefined
    const matched = new Set<string>()
    const batches = new Set<string>()
    for (const order of this.state.orders.list()) {
      for (const detail of order.details) {
        if (plan.outcomes.some((outcome) => outcome.outBizNo === detail.outBizNo)) {
          matched.add(detail.outBizNo)
          batches.add(order.outBatchNo)
        }
      }
    }
    return {
      ...plan,
      matchedOutBizNos: [...matched],
      unmatchedOutBizNos: plan.outcomes.map((item) => item.outBizNo).filter((item) => !matched.has(item)),
      batchNos: [...batches],
    }
  }

  deleteRunPlan(runId: string) {
    return this.state.runs.delete(runId)
  }

  async applyRunOutcomes(runId: string, notify = true, callbackDelayMs = { min: 500, max: 1500 }) {
    const summary = this.getRunSummary(runId)
    if (!summary) throw new Error('运行计划不存在')
    if (summary.unmatchedOutBizNos.length) {
      throw new Error(`运行计划存在未提交订单: ${summary.unmatchedOutBizNos.join(',')}`)
    }
    const outcomeByNo = new Map(summary.outcomes.map((item) => [item.outBizNo, item]))
    const affectedBatchNos: string[] = []
    for (const order of this.state.orders.list()) {
      if (!order.details.some((detail) => outcomeByNo.has(detail.outBizNo))) continue
      this.state.orders.update(order.outBatchNo, (current) => {
        const details = current.details.map((detail) => {
          const outcome = outcomeByNo.get(detail.outBizNo)
          return outcome
            ? {
                ...detail,
                detailStatus: outcome.status,
                errorCode: outcome.status === 'FAIL' ? outcome.errorCode : undefined,
                errorMsg: outcome.status === 'FAIL' ? outcome.errorMsg : undefined,
              }
            : detail
        })
        return { ...current, details, batchStatus: summarizeBatchStatus(details), updatedAt: new Date().toISOString() }
      })
      affectedBatchNos.push(order.outBatchNo)
    }
    const notifications = notify
      ? await Promise.all(
          affectedBatchNos.map(async (batchNo) => {
            const delayMs = randomInteger(callbackDelayMs.min, callbackDelayMs.max)
            await wait(delayMs)
            return { ...(await this.sendNotify(batchNo)), delayMs }
          }),
        )
      : []
    return { runId, batchNos: affectedBatchNos, notifications, summary: this.getRunSummary(runId) }
  }

  async sendNotify(
    outBatchNo: string,
    notifyUrl?: string,
    originInterface: string = ALIPAY_BATCH_METHODS.create,
  ) {
    const order = this.state.orders.find(outBatchNo)
    if (!order) throw new Error('订单不存在')
    const target = notifyUrl || this.state.getSettings().notifyUrl
    if (!target) throw new Error('未配置notifyUrl')
    const keys = await getAlipayTestKeys()
    const bizContent = JSON.stringify({
      out_batch_no: order.outBatchNo,
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      origin_interface: originInterface,
      batch_trans_id: order.batchTransId,
      batch_status: order.batchStatus,
      total_amount: order.amount,
      ...(order.details[0]?.errorCode ? { error_code: order.details[0].errorCode } : {}),
    })
    const fields: Record<string, string> = {
      app_id: APP_ID,
      biz_content: bizContent,
      msg_method: 'alipay.fund.batch.order.changed',
      notify_id: randomUUID().replaceAll('-', ''),
      sign_type: 'RSA2',
      utc_timestamp: new Date().toISOString(),
      version: '1.0',
    }
    fields.sign = signRsa2(canonicalize(fields, new Set()), keys.alipayPrivateKey)
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })
    const responseText = await response.text()
    this.state.orders.update(outBatchNo, (current) => ({
      ...current,
      notifyCount: current.notifyCount + 1,
      lastNotifyResult: `${response.status}:${responseText}`,
      updatedAt: new Date().toISOString(),
    }))
    return { target, status: response.status, body: responseText, success: response.ok && responseText === 'success' }
  }
}

const pluginKey = Symbol.for('to-pay.mock.alipay-batch.plugin')

export function getAlipayBatchPlugin(): AlipayBatchPlugin {
  const globals = globalThis as typeof globalThis & { [pluginKey]?: AlipayBatchPlugin }
  globals[pluginKey] ??= new AlipayBatchPlugin()
  return globals[pluginKey]
}

export { APP_ID }
