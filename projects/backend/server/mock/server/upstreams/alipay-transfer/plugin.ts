import { createHash, randomUUID } from 'node:crypto'
import type { MockGatewayRequest, MockGatewayResponse, UpstreamMockPlugin } from '@mock/core/contracts'
import { canonicalize, signRsa2, verifyRsa2 } from '../alipay-batch/crypto'
import { AlipayApiError, invalidArgument } from '../alipay-batch/errors'
import { getAlipayTestKeys } from '../alipay-batch/key-store'
import { getAlipayTransferState } from './state'
import {
  ALIPAY_TRANSFER_METHODS,
  type AlipayTransferOrder,
  type AlipayTransferRunOutcome,
  type AlipayTransferStatus,
} from './types'

export const APP_ID = process.env.MOCK_ALIPAY_APP_ID ?? '2026000000000001'

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw invalidArgument(`${field}不能为空`)
  return value
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidArgument(`${field}格式错误`)
  return value as Record<string, unknown>
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

function randomInteger(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function wait(milliseconds: number) {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve()
}

function md5Sign(secret: string, fields: Record<string, string>) {
  const content = Object.keys(fields)
    .filter((key) => key !== 'sign' && fields[key] !== '')
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&')
  return createHash('md5').update(`${content}&key=${secret}`).digest('hex')
}

export class AlipayTransferMockPlugin implements UpstreamMockPlugin {
  readonly id = 'alipay-transfer'
  readonly methods = Object.values(ALIPAY_TRANSFER_METHODS)
  private readonly state = getAlipayTransferState()

  async handle(request: MockGatewayRequest): Promise<MockGatewayResponse> {
    const traceId = randomUUID().replaceAll('-', '')
    try {
      await this.verifyRequest(request.params)
      const body = this.parseBizContent(request.params.biz_content)
      const data =
        request.method === ALIPAY_TRANSFER_METHODS.create
          ? this.createOrder(body)
          : request.method === ALIPAY_TRANSFER_METHODS.query
            ? this.queryOrder(body)
            : (() => {
                throw new AlipayApiError('40004', 'isv.invalid-method', 'Business Failed', '不支持的接口方法')
              })()
      return this.response(request.method, data, traceId)
    } catch (error) {
      const apiError =
        error instanceof AlipayApiError
          ? error
          : new AlipayApiError('40004', 'mock.internal-error', 'Business Failed', (error as Error).message)
      return this.response(
        'error',
        { code: apiError.code, msg: apiError.message, sub_code: apiError.subCode, sub_msg: apiError.subMessage },
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

  private assertProduct(body: Record<string, unknown>) {
    if (body.product_code !== 'TRANS_ACCOUNT_NO_PWD' || body.biz_scene !== 'DIRECT_TRANSFER') {
      throw invalidArgument('仅支持TRANS_ACCOUNT_NO_PWD + DIRECT_TRANSFER')
    }
  }

  private createOrder(body: Record<string, unknown>) {
    this.assertProduct(body)
    const outBizNo = requiredString(body.out_biz_no, 'out_biz_no')
    if (this.state.orders.find(outBizNo)) {
      throw new AlipayApiError('40004', 'isv.out-biz-no-duplicate', 'Business Failed', 'out_biz_no重复')
    }
    const payee = asObject(body.payee_info, 'payee_info')
    if (payee.identity_type !== 'ALIPAY_LOGON_ID') throw invalidArgument('仅支持ALIPAY_LOGON_ID')
    const payeeIdentity = requiredString(payee.identity, 'payee_info.identity')
    const plan = this.state.runs
      .list()
      .find((item) => item.outcomes.some((outcome) => outcome.accountNo === payeeIdentity))
    const now = new Date().toISOString()
    const order: AlipayTransferOrder = {
      id: outBizNo,
      outBizNo,
      orderId: `2026${Date.now()}${randomInteger(100000, 999999)}`,
      payFundOrderId: `PF${Date.now()}${randomInteger(1000, 9999)}`,
      amount: amount(body.trans_amount, 'trans_amount'),
      orderTitle: requiredString(body.order_title, 'order_title'),
      payeeIdentity,
      payeeName: typeof payee.name === 'string' ? payee.name : undefined,
      status: 'DEALING',
      runId: plan?.runId,
      notifyCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.state.orders.insert(order)
    return {
      code: '10000',
      msg: 'Success',
      out_biz_no: order.outBizNo,
      order_id: order.orderId,
      pay_fund_order_id: order.payFundOrderId,
      status: order.status,
      trans_date: now,
    }
  }

  private queryOrder(body: Record<string, unknown>) {
    this.assertProduct(body)
    const outBizNo = requiredString(body.out_biz_no, 'out_biz_no')
    const order = this.state.orders.find(outBizNo)
    if (!order) throw new AlipayApiError('40004', 'ORDER_NOT_EXIST', 'Business Failed', '订单不存在')
    return {
      code: '10000',
      msg: 'Success',
      out_biz_no: order.outBizNo,
      order_id: order.orderId,
      pay_fund_order_id: order.payFundOrderId,
      status: order.status,
      trans_amount: order.amount,
      ...(order.errorCode ? { error_code: order.errorCode, sub_order_error_code: order.errorCode } : {}),
      ...(order.errorMsg ? { fail_reason: order.errorMsg, sub_msg: order.errorMsg } : {}),
    }
  }

  private async response(method: string, data: Record<string, unknown>, traceId: string) {
    const keys = await getAlipayTestKeys()
    const responseKey = method === 'error' ? 'error_response' : `${method.replaceAll('.', '_')}_response`
    return {
      status: 200,
      headers: { trace_id: traceId, 'content-type': 'application/json; charset=utf-8' },
      body: { [responseKey]: data, sign: signRsa2(JSON.stringify(data), keys.alipayPrivateKey) },
    }
  }

  upsertRunPlan(runId: string, outcomes: AlipayTransferRunOutcome[]) {
    const now = new Date().toISOString()
    const accounts = new Set(outcomes.map((outcome) => outcome.accountNo))
    const conflict = this.state.runs
      .list()
      .find((plan) => plan.runId !== runId && plan.outcomes.some((outcome) => accounts.has(outcome.accountNo)))
    if (conflict) throw new Error(`收款账号已被运行计划${conflict.runId}占用`)
    const existing = this.state.runs.find(runId)
    if (existing) return this.state.runs.update(runId, (plan) => ({ ...plan, outcomes, updatedAt: now }))!
    return this.state.runs.insert({ id: runId, runId, outcomes, createdAt: now, updatedAt: now })
  }

  getRunSummary(runId: string) {
    const plan = this.state.runs.find(runId)
    if (!plan) return undefined
    const plannedAccounts = new Set(plan.outcomes.map((outcome) => outcome.accountNo))
    const orders = this.state.orders.list().filter((order) => plannedAccounts.has(order.payeeIdentity))
    const matchedAccounts = new Set(orders.map((order) => order.payeeIdentity))
    return {
      ...plan,
      matchedAccountNos: [...matchedAccounts],
      unmatchedAccountNos: plan.outcomes.map((item) => item.accountNo).filter((item) => !matchedAccounts.has(item)),
      orderNos: orders.map((order) => order.outBizNo),
    }
  }

  deleteRunPlan(runId: string) {
    return this.state.runs.delete(runId)
  }

  async applyRunOutcomes(runId: string, notify = true, callbackDelay = { min: 500, max: 1500 }) {
    const summary = this.getRunSummary(runId)
    if (!summary) throw new Error('运行计划不存在')
    if (summary.unmatchedAccountNos.length)
      throw new Error(`运行计划存在未创建订单: ${summary.unmatchedAccountNos.join(',')}`)
    const outcomes = new Map(summary.outcomes.map((outcome) => [outcome.accountNo, outcome]))
    const affected: AlipayTransferOrder[] = []
    for (const outBizNo of summary.orderNos) {
      const updated = this.state.orders.update(outBizNo, (order) => {
        const outcome = outcomes.get(order.payeeIdentity)!
        return {
          ...order,
          status: outcome.status,
          errorCode: outcome.status === 'FAIL' ? outcome.errorCode : undefined,
          errorMsg: outcome.status === 'FAIL' ? outcome.errorMsg : undefined,
          updatedAt: new Date().toISOString(),
        }
      })!
      affected.push(updated)
    }
    const terminal = affected.filter((order) => order.status === 'SUCCESS' || order.status === 'FAIL')
    const notifications = notify
      ? await Promise.all(
          terminal.map(async (order) => {
            const delayMs = randomInteger(callbackDelay.min, callbackDelay.max)
            await wait(delayMs)
            return { ...(await this.sendNotify(order.outBizNo)), delayMs }
          }),
        )
      : []
    return {
      runId,
      orderNos: summary.orderNos,
      expectedNotificationCount: terminal.length,
      notifications,
      summary: this.getRunSummary(runId),
    }
  }

  async sendNotify(outBizNo: string, notifyUrl?: string) {
    const order = this.state.orders.find(outBizNo)
    if (!order) throw new Error('订单不存在')
    if (order.status !== 'SUCCESS' && order.status !== 'FAIL') throw new Error('处理中订单不能发送终态通知')
    const settings = this.state.getSettings()
    const target = notifyUrl || settings.notifyUrl
    if (!target) throw new Error('未配置notifyUrl')
    const fields: Record<string, string> = {
      appid: APP_ID,
      tradeNo: order.outBizNo,
      orderNo: order.orderId,
      txnDt: new Date().toISOString(),
      money: amountInCents(order.amount),
      fee: '0',
      paySt: order.status,
      bankName: 'ALIPAY',
      msg: order.errorMsg ?? '',
    }
    fields.sign = md5Sign(settings.callbackSecret, fields)
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })
    const responseText = await response.text()
    this.state.orders.update(outBizNo, (current) => ({
      ...current,
      notifyCount: current.notifyCount + 1,
      lastNotifyResult: `${response.status}:${responseText}`,
      updatedAt: new Date().toISOString(),
    }))
    return { target, status: response.status, body: responseText, success: response.ok && responseText === 'success' }
  }
}

const pluginKey = Symbol.for('to-pay.mock.alipay-transfer.plugin')

export function getAlipayTransferPlugin() {
  const globals = globalThis as typeof globalThis & { [pluginKey]?: AlipayTransferMockPlugin }
  globals[pluginKey] ??= new AlipayTransferMockPlugin()
  return globals[pluginKey]
}
