import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginRegistry } from '@mock/core/plugin-registry'
import { validateRunApply, validateRunPlan, validateSettingsPatch } from '@mock/upstreams/alipay-batch/control'
import { canonicalize, signRsa2, verifyRsa2 } from '@mock/upstreams/alipay-batch/crypto'
import { getAlipayTestKeys } from '@mock/upstreams/alipay-batch/key-store'
import { AlipayBatchPlugin, APP_ID } from '@mock/upstreams/alipay-batch/plugin'
import { DEFAULT_NOTIFY_URL, getAlipayBatchState } from '@mock/upstreams/alipay-batch/state'
import { ALIPAY_BATCH_METHODS } from '@mock/upstreams/alipay-batch/types'

let dataDirectory: string
let plugin: AlipayBatchPlugin

function responseBody(response: Awaited<ReturnType<AlipayBatchPlugin['handle']>>) {
  return response.body as Record<string, Record<string, unknown> | string>
}

async function signedRequest(method: string, bizContent: Record<string, unknown>) {
  const keys = await getAlipayTestKeys()
  const params: Record<string, string> = {
    app_id: APP_ID,
    biz_content: JSON.stringify(bizContent),
    charset: 'utf-8',
    method,
    sign_type: 'RSA2',
    timestamp: '2026-08-20 12:00:00',
    version: '1.0',
  }
  params.sign = signRsa2(canonicalize(params), keys.appPrivateKey)
  return plugin.handle({ method, params, headers: new Headers() })
}

async function createOrder(outBatchNo = 'MOCK202608200001', count = 1) {
  const details = Array.from({ length: count }, (_, index) => ({
    out_biz_no: `${outBatchNo}-${index + 1}`,
    order_title: '本地测试',
    remark: '测试转账备注',
    trans_amount: '100.00',
    payee_info: {
      identity: `mock${index + 1}@example.com`,
      identity_type: 'ALIPAY_LOGON_ID',
      name: `测试用户${index + 1}`,
    },
  }))
  return signedRequest(ALIPAY_BATCH_METHODS.create, {
    out_batch_no: outBatchNo,
    product_code: 'BATCH_PAY_V2',
    biz_scene: 'MESSAGE_BATCH_PAY',
    order_title: '本地测试',
    remark: '测试批次备注',
    total_trans_amount: `${count * 100}.00`,
    total_count: String(count),
    trans_order_list: details,
  })
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'to-pay-mock-'))
  process.env.MOCK_DATA_DIR = dataDirectory
  plugin = new AlipayBatchPlugin()
  await getAlipayTestKeys()
})

beforeEach(() => {
  getAlipayBatchState().reset()
  getAlipayBatchState().updateSettings({ notifyUrl: '', randomDetailFailRate: 0 })
})

afterAll(async () => {
  await rm(dataDirectory, { recursive: true, force: true })
})

describe('PluginRegistry', () => {
  it('按支付宝方法分发，并明确拒绝未知方法', async () => {
    const registry = new PluginRegistry().register(plugin)
    expect(registry.describe()).toEqual([{ id: 'alipay-batch', methods: Object.values(ALIPAY_BATCH_METHODS) }])

    const response = await registry.dispatch({ method: 'unknown.method', params: {}, headers: new Headers() })
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ code: 'MOCK_METHOD_NOT_FOUND', message: 'No mock plugin handles unknown.method' })
  })
})

describe('AlipayBatchPlugin', () => {
  it('默认通过本地转发应用发送回调', () => {
    expect(DEFAULT_NOTIFY_URL).toBe(
      process.env.MOCK_ALIPAY_NOTIFY_URL ?? 'http://127.0.0.1:3100/v1/notify/alipay-batch',
    )
  })

  it('校验随机失败率配置范围', () => {
    expect(validateSettingsPatch({ randomDetailFailRate: 35 })).toEqual({ randomDetailFailRate: 35 })
    expect(() => validateSettingsPatch({ randomDetailFailRate: -1 })).toThrow(
      'randomDetailFailRate必须是0到100之间的整数',
    )
    expect(() => validateSettingsPatch({ randomDetailFailRate: 101 })).toThrow(
      'randomDetailFailRate必须是0到100之间的整数',
    )
  })

  it('校验运行计划回调抖动范围', () => {
    expect(validateRunApply({})).toEqual({
      notify: true,
      callbackDelayMinMs: 500,
      callbackDelayMaxMs: 1500,
    })
    expect(validateRunApply({ notify: true, callbackDelayMinMs: 500, callbackDelayMaxMs: 1500 })).toEqual({
      notify: true,
      callbackDelayMinMs: 500,
      callbackDelayMaxMs: 1500,
    })
    expect(() => validateRunApply({ callbackDelayMinMs: -1 })).toThrow('callbackDelayMinMs必须为非负安全整数')
    expect(() => validateRunApply({ callbackDelayMinMs: 100, callbackDelayMaxMs: 99 })).toThrow(
      'callbackDelayMaxMs必须大于等于callbackDelayMinMs',
    )
  })

  it('校验RSA2请求签名，并对响应签名', async () => {
    const response = await createOrder()
    const body = responseBody(response)
    const result = body.alipay_fund_batch_create_response as Record<string, unknown>
    const keys = await getAlipayTestKeys()

    expect(result).toMatchObject({ code: '10000', out_batch_no: 'MOCK202608200001', status: 'DEALING' })
    expect(verifyRsa2(JSON.stringify(result), body.sign as string, keys.alipayPublicKey)).toBe(true)
  })

  it('拒绝无效请求签名', async () => {
    const response = await plugin.handle({
      method: ALIPAY_BATCH_METHODS.balance,
      params: {
        app_id: APP_ID,
        biz_content: JSON.stringify({ account_type: 'ACCTRANS_ACCOUNT', alipay_user_id: '2088000000000000' }),
        method: ALIPAY_BATCH_METHODS.balance,
        sign_type: 'RSA2',
        sign: 'invalid',
      },
      headers: new Headers(),
    })
    expect(responseBody(response).error_response).toMatchObject({
      code: '40002',
      sub_code: 'isv.invalid-signature',
    })
  })

  it('首次查单按默认配置从处理中推进为成功', async () => {
    await createOrder()
    const response = await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
      out_batch_no: 'MOCK202608200001',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 20,
    })
    const result = responseBody(response).alipay_fund_batch_detail_query_response as Record<string, unknown>

    expect(result.batch_status).toBe('SUCCESS')
    expect(result.acc_detail_list).toEqual([
      expect.objectContaining({
        out_biz_no: 'MOCK202608200001-1',
        status: 'SUCCESS',
        trans_amount: '100.00',
        remark: '测试转账备注',
      }),
    ])
  })

  it('创建并查询包含多笔明细的批次订单', async () => {
    const create = await createOrder('MOCK202608200010', 3)
    expect(responseBody(create).alipay_fund_batch_create_response).toMatchObject({
      code: '10000',
      out_batch_no: 'MOCK202608200010',
    })

    const response = await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
      out_batch_no: 'MOCK202608200010',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 100,
    })
    const result = responseBody(response).alipay_fund_batch_detail_query_response as Record<string, unknown>
    expect(result).toMatchObject({ batch_status: 'SUCCESS', total_amount: '300.00', total_count: '3' })
    expect(result.acc_detail_list).toEqual([
      expect.objectContaining({ out_biz_no: 'MOCK202608200010-1', trans_amount: '100.00' }),
      expect.objectContaining({ out_biz_no: 'MOCK202608200010-2', trans_amount: '100.00' }),
      expect.objectContaining({ out_biz_no: 'MOCK202608200010-3', trans_amount: '100.00' }),
    ])
  })

  it('关闭未支付批次后将全部明细置为失败并发送一次批次回调', async () => {
    getAlipayBatchState().updateSettings({
      createBatchStatus: 'WAIT_PAY',
      createDetailStatus: 'WAIT_PAY',
      notifyUrl: '',
    })
    const created = await createOrder('MOCK_CLOSE_BATCH', 2)
    const createdResult = responseBody(created).alipay_fund_batch_create_response as Record<string, string>
    const notify = vi
      .spyOn(plugin, 'sendNotify')
      .mockResolvedValue({ target: 'http://127.0.0.1/notify', status: 200, body: 'success', success: true })
    getAlipayBatchState().updateSettings({ notifyUrl: 'http://127.0.0.1/notify' })

    try {
      const response = await signedRequest(ALIPAY_BATCH_METHODS.close, {
        out_batch_no: 'MOCK_CLOSE_BATCH',
        batch_trans_id: createdResult.batch_trans_id,
        product_code: 'BATCH_PAY_V2',
        biz_scene: 'MESSAGE_BATCH_PAY',
      })
      const result = responseBody(response).alipay_fund_batch_close_response as Record<string, unknown>
      expect(result).toMatchObject({
        code: '10000',
        batch_trans_id: createdResult.batch_trans_id,
        status: 'DISUSE',
      })
      expect(getAlipayBatchState().orders.find('MOCK_CLOSE_BATCH')).toMatchObject({
        batchStatus: 'DISUSE',
        details: [
          expect.objectContaining({ detailStatus: 'FAIL', errorCode: 'BATCH_CLOSED' }),
          expect.objectContaining({ detailStatus: 'FAIL', errorCode: 'BATCH_CLOSED' }),
        ],
      })
      await vi.waitFor(() => {
        expect(notify).toHaveBeenCalledTimes(1)
        expect(notify).toHaveBeenCalledWith('MOCK_CLOSE_BATCH', undefined, ALIPAY_BATCH_METHODS.close)
      })
    } finally {
      notify.mockRestore()
    }
  })

  it('已进入支付处理的批次禁止关单', async () => {
    await createOrder('MOCK_CLOSE_REJECTED')
    const response = await signedRequest(ALIPAY_BATCH_METHODS.close, {
      out_batch_no: 'MOCK_CLOSE_REJECTED',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
    })

    expect(responseBody(response).error_response).toMatchObject({
      code: '40004',
      sub_code: 'isv.batch-status-error',
      sub_msg: '当前批次状态不允许关单',
    })
  })

  it('自动推进多笔批次时至少随机产生一笔失败明细', async () => {
    await createOrder('MOCK_RANDOM_FAILURE', 3)
    getAlipayBatchState().updateSettings({ randomDetailFailRate: 20 })
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)

    try {
      const response = await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
        out_batch_no: 'MOCK_RANDOM_FAILURE',
        product_code: 'BATCH_PAY_V2',
        biz_scene: 'MESSAGE_BATCH_PAY',
        page_num: 1,
        page_size: 100,
      })
      const result = responseBody(response).alipay_fund_batch_detail_query_response as Record<string, any>
      const details = result.acc_detail_list as Array<Record<string, unknown>>

      expect(result.batch_status).toBe('PART_SUCCESS')
      expect(details.filter((detail) => detail.status === 'FAIL')).toHaveLength(1)
      expect(details.find((detail) => detail.status === 'FAIL')).toMatchObject({
        error_code: 'MOCK_RANDOM_FAILURE',
        error_msg: 'Mock随机模拟订单失败',
      })
    } finally {
      random.mockRestore()
    }
  })

  it('按运行计划确定性设置成功、失败和处理中明细', async () => {
    await createOrder('MOCK_RUN_PLAN', 3)
    const outcomes = validateRunPlan({
      outcomes: [
        { outBizNo: 'MOCK_RUN_PLAN-1', status: 'SUCCESS' },
        { outBizNo: 'MOCK_RUN_PLAN-2', status: 'FAIL', errorCode: 'ACCOUNT_INVALID', errorMsg: '账号错误' },
        { outBizNo: 'MOCK_RUN_PLAN-3', status: 'DEALING' },
      ],
    })
    plugin.upsertRunPlan('RUN_PLAN_001', outcomes)

    expect(plugin.getRunSummary('RUN_PLAN_001')).toMatchObject({
      matchedOutBizNos: ['MOCK_RUN_PLAN-1', 'MOCK_RUN_PLAN-2', 'MOCK_RUN_PLAN-3'],
      unmatchedOutBizNos: [],
      batchNos: ['MOCK_RUN_PLAN'],
    })
    await plugin.applyRunOutcomes('RUN_PLAN_001', false)

    expect(getAlipayBatchState().orders.find('MOCK_RUN_PLAN')).toMatchObject({
      batchStatus: 'DEALING',
      details: [
        expect.objectContaining({ outBizNo: 'MOCK_RUN_PLAN-1', detailStatus: 'SUCCESS' }),
        expect.objectContaining({
          outBizNo: 'MOCK_RUN_PLAN-2',
          detailStatus: 'FAIL',
          errorCode: 'ACCOUNT_INVALID',
          errorMsg: '账号错误',
        }),
        expect.objectContaining({ outBizNo: 'MOCK_RUN_PLAN-3', detailStatus: 'DEALING' }),
      ],
    })
  })

  it('运行计划包含未提交订单时禁止部分应用', async () => {
    plugin.upsertRunPlan('RUN_PLAN_002', [{ outBizNo: 'NOT_SUBMITTED', status: 'SUCCESS' }])
    await expect(plugin.applyRunOutcomes('RUN_PLAN_002', false)).rejects.toThrow('运行计划存在未提交订单')
  })

  it('按批次独立等待回调抖动时间', async () => {
    await createOrder('MOCK_CALLBACK_JITTER')
    plugin.upsertRunPlan('RUN_PLAN_JITTER', [{ outBizNo: 'MOCK_CALLBACK_JITTER-1', status: 'SUCCESS' }])
    const notify = vi
      .spyOn(plugin, 'sendNotify')
      .mockResolvedValue({ target: 'http://127.0.0.1/notify', status: 200, body: 'success', success: true })
    vi.useFakeTimers()
    try {
      const applying = plugin.applyRunOutcomes('RUN_PLAN_JITTER', true, { min: 750, max: 750 })
      await vi.advanceTimersByTimeAsync(749)
      expect(notify).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      const result = await applying
      expect(notify).toHaveBeenCalledWith('MOCK_CALLBACK_JITTER')
      expect(result.notifications).toEqual([expect.objectContaining({ success: true, delayMs: 750 })])
    } finally {
      vi.useRealTimers()
      notify.mockRestore()
    }
  })

  it('首次查单优先应用运行计划而不是随机推进配置', async () => {
    plugin.upsertRunPlan('RUN_PLAN_003', [
      { outBizNo: 'MOCK_FIRST_QUERY-1', status: 'FAIL', errorCode: 'PLANNED', errorMsg: '计划失败' },
    ])
    await createOrder('MOCK_FIRST_QUERY')
    const response = await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
      out_batch_no: 'MOCK_FIRST_QUERY',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 100,
    })
    const result = responseBody(response).alipay_fund_batch_detail_query_response as Record<string, any>
    expect(result.batch_status).toBe('FAIL')
    expect(result.acc_detail_list).toEqual([
      expect.objectContaining({ out_biz_no: 'MOCK_FIRST_QUERY-1', status: 'FAIL', error_code: 'PLANNED' }),
    ])
  })

  it('拒绝批次数量或总金额与明细不一致的请求', async () => {
    const countMismatch = await signedRequest(ALIPAY_BATCH_METHODS.create, {
      out_batch_no: 'MOCK_COUNT_MISMATCH',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      order_title: '本地测试',
      total_trans_amount: '100.00',
      total_count: '2',
      trans_order_list: [],
    })
    expect(responseBody(countMismatch).error_response).toMatchObject({ sub_code: 'isv.invalid-parameter' })

    const amountMismatch = await signedRequest(ALIPAY_BATCH_METHODS.create, {
      out_batch_no: 'MOCK_AMOUNT_MISMATCH',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      order_title: '本地测试',
      total_trans_amount: '99.99',
      total_count: '1',
      trans_order_list: [
        {
          out_biz_no: 'DETAIL-1',
          order_title: '本地测试',
          trans_amount: '100.00',
          payee_info: { identity: 'mock@example.com', identity_type: 'ALIPAY_LOGON_ID', name: '测试用户' },
        },
      ],
    })
    expect(responseBody(amountMismatch).error_response).toMatchObject({ sub_code: 'isv.invalid-parameter' })
  })

  it('返回可配置余额', async () => {
    getAlipayBatchState().updateSettings({ availableAmount: '9527.66', freezeAmount: '12.34' })
    const response = await signedRequest(ALIPAY_BATCH_METHODS.balance, {
      account_type: 'ACCTRANS_ACCOUNT',
      alipay_user_id: '2088000000000000',
    })
    expect(responseBody(response).alipay_fund_account_query_response).toMatchObject({
      code: '10000',
      available_amount: '9527.66',
      freeze_amount: '12.34',
    })
  })

  it('按支付宝两步流程申请并查询电子回单', async () => {
    await createOrder('MOCK202608200003')
    await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
      out_batch_no: 'MOCK202608200003',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 20,
    })
    const detail = getAlipayBatchState().orders.find('MOCK202608200003')!.details[0]
    const apply = await signedRequest(ALIPAY_BATCH_METHODS.receiptApply, {
      type: 'FUND_DETAIL',
      key: detail.detailId,
    })
    const applyResult = responseBody(apply).alipay_data_bill_ereceipt_apply_response as Record<string, unknown>
    expect(applyResult).toMatchObject({ code: '10000' })

    const query = await signedRequest(ALIPAY_BATCH_METHODS.receiptQuery, { file_id: applyResult.file_id })
    const queryResult = responseBody(query).alipay_data_bill_ereceipt_query_response as Record<string, unknown>
    expect(queryResult).toMatchObject({ code: '10000', status: 'SUCCESS' })
    expect(queryResult.download_url).toContain('/api/mock/alipay-batch/receipts/')
  })

  it('支持手动设置失败状态和失败原因', async () => {
    await createOrder()
    plugin.updateOrderStatus('MOCK202608200001', {
      batchStatus: 'FAIL',
      errorCode: 'PAYEE_ACCOUNT_INVALID',
      errorMsg: '收款账号不存在',
    })

    const response = await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
      out_batch_no: 'MOCK202608200001',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 20,
    })
    const result = responseBody(response).alipay_fund_batch_detail_query_response as Record<string, unknown>
    expect(result.batch_status).toBe('FAIL')
    expect(result.acc_detail_list).toEqual([
      expect.objectContaining({
        status: 'FAIL',
        error_code: 'PAYEE_ACCOUNT_INVALID',
        error_msg: '收款账号不存在',
      }),
    ])
  })

  it('支持分别设置批次内明细状态以模拟部分成功', async () => {
    await createOrder('MOCK_PART_SUCCESS', 2)
    plugin.updateOrderStatus('MOCK_PART_SUCCESS', {
      batchStatus: 'PART_SUCCESS',
      details: [
        { outBizNo: 'MOCK_PART_SUCCESS-1', detailStatus: 'SUCCESS' },
        {
          outBizNo: 'MOCK_PART_SUCCESS-2',
          detailStatus: 'FAIL',
          errorCode: 'PAYEE_ACCOUNT_INVALID',
          errorMsg: '收款账号不存在',
        },
      ],
    })

    const response = await signedRequest(ALIPAY_BATCH_METHODS.detailQuery, {
      out_batch_no: 'MOCK_PART_SUCCESS',
      product_code: 'BATCH_PAY_V2',
      biz_scene: 'MESSAGE_BATCH_PAY',
      page_num: 1,
      page_size: 100,
    })
    const result = responseBody(response).alipay_fund_batch_detail_query_response as Record<string, unknown>
    expect(result.batch_status).toBe('PART_SUCCESS')
    expect(result.acc_detail_list).toEqual([
      expect.objectContaining({ out_biz_no: 'MOCK_PART_SUCCESS-1', status: 'SUCCESS' }),
      expect.objectContaining({
        out_biz_no: 'MOCK_PART_SUCCESS-2',
        status: 'FAIL',
        error_code: 'PAYEE_ACCOUNT_INVALID',
        error_msg: '收款账号不存在',
      }),
    ])
  })

  it('为多笔批次发送适配器可验签的支付宝异步通知', async () => {
    await createOrder('MOCK202608200001', 2)
    plugin.updateOrderStatus('MOCK202608200001', { batchStatus: 'SUCCESS' })
    const keys = await getAlipayTestKeys()
    let received: Record<string, string> | undefined
    const server: Server = createServer((request, response) => {
      let raw = ''
      request.setEncoding('utf8')
      request.on('data', (chunk) => (raw += chunk))
      request.on('end', () => {
        received = Object.fromEntries(new URLSearchParams(raw))
        response.end('success')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('测试回调服务启动失败')
      const result = await plugin.sendNotify('MOCK202608200001', `http://127.0.0.1:${address.port}/notify`)
      expect(result.success).toBe(true)
      expect(received?.msg_method).toBe('alipay.fund.batch.order.changed')
      expect(verifyRsa2(canonicalize(received!), received!.sign, keys.alipayPublicKey)).toBe(true)
      expect(JSON.parse(received!.biz_content)).toMatchObject({
        out_batch_no: 'MOCK202608200001',
        batch_status: 'SUCCESS',
        total_amount: '200.00',
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it('配置 notifyUrl 后下单自动发送一次异步通知', async () => {
    let received: Record<string, string> | undefined
    const server: Server = createServer((request, response) => {
      let raw = ''
      request.setEncoding('utf8')
      request.on('data', (chunk) => (raw += chunk))
      request.on('end', () => {
        received = Object.fromEntries(new URLSearchParams(raw))
        response.end('success')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('测试回调服务启动失败')
      getAlipayBatchState().updateSettings({ notifyUrl: `http://127.0.0.1:${address.port}/notify` })
      await createOrder('MOCK202608200002')

      for (let attempt = 0; attempt < 20 && !received; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(received?.msg_method).toBe('alipay.fund.batch.order.changed')
      expect(JSON.parse(received!.biz_content)).toMatchObject({
        out_batch_no: 'MOCK202608200002',
        batch_status: 'DEALING',
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
