import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PluginRegistry } from '@mock/core/plugin-registry'
import {
  getLocalAlipayTransferConfig,
  validateTransferRunApply,
  validateTransferRunPlan,
} from '@mock/upstreams/alipay-transfer/control'
import { canonicalize, signRsa2, verifyRsa2 } from '@mock/upstreams/alipay-batch/crypto'
import { getAlipayTestKeys } from '@mock/upstreams/alipay-batch/key-store'
import { AlipayTransferMockPlugin, APP_ID } from '@mock/upstreams/alipay-transfer/plugin'
import { DEFAULT_TRANSFER_NOTIFY_URL, getAlipayTransferState } from '@mock/upstreams/alipay-transfer/state'
import { ALIPAY_TRANSFER_METHODS } from '@mock/upstreams/alipay-transfer/types'

let plugin: AlipayTransferMockPlugin

function body(response: Awaited<ReturnType<AlipayTransferMockPlugin['handle']>>) {
  return response.body as Record<string, Record<string, unknown> | string>
}

async function request(method: string, bizContent: Record<string, unknown>) {
  const keys = await getAlipayTestKeys()
  const params: Record<string, string> = {
    app_id: APP_ID,
    biz_content: JSON.stringify(bizContent),
    charset: 'utf-8',
    method,
    sign_type: 'RSA2',
    timestamp: '2026-08-22 12:00:00',
    version: '1.0',
  }
  params.sign = signRsa2(canonicalize(params), keys.appPrivateKey)
  return plugin.handle({ method, params, headers: new Headers() })
}

async function create(outBizNo = 'PFA_TRANSFER_1', accountNo = 'mock1@example.com') {
  return request(ALIPAY_TRANSFER_METHODS.create, {
    out_biz_no: outBizNo,
    trans_amount: '123.45',
    product_code: 'TRANS_ACCOUNT_NO_PWD',
    biz_scene: 'DIRECT_TRANSFER',
    payee_info: { identity_type: 'ALIPAY_LOGON_ID', identity: accountNo, name: '测试用户' },
    order_title: '转账',
  })
}

beforeAll(() => {
  plugin = new AlipayTransferMockPlugin()
})

beforeEach(() => {
  getAlipayTransferState().reset()
})

describe('AlipayTransferMockPlugin', () => {
  it('注册单笔方法且不会抢占批量方法', () => {
    const registry = new PluginRegistry().register(plugin)
    expect(registry.describe()).toEqual([{ id: 'alipay-transfer', methods: Object.values(ALIPAY_TRANSFER_METHODS) }])
  })

  it('默认回调必须经过转发应用', () => {
    expect(DEFAULT_TRANSFER_NOTIFY_URL).toBe(
      process.env.MOCK_ALIPAY_TRANSFER_NOTIFY_URL ?? 'http://127.0.0.1:3100/v1/notify/alipay-transfer',
    )
  })

  it('本地通道配置默认通过转发应用访问Mock', async () => {
    const config = await getLocalAlipayTransferConfig('http://127.0.0.1:13002')
    expect(config.mockGateway).toBe('http://127.0.0.1:13002/api/alipay/gateway')
    expect(config.pfaParams).toMatchObject({
      appId: APP_ID,
      authMode: 'KEY',
      appKey: 'mock-alipay-transfer-callback-secret',
      gateway: process.env.MOCK_ALIPAY_TRANSFER_FORWARDER_GATEWAY ?? 'http://127.0.0.1:3100/v1/gateway/alipay-transfer',
    })
    expect(config.pfaParams.privateKey).toContain('-----BEGIN PRIVATE KEY-----')
    expect(config.pfaParams.alipayPublicKey).toContain('-----BEGIN PUBLIC KEY-----')
  })

  it('校验RSA2签名并创建处理中单笔订单', async () => {
    const response = await create()
    const result = body(response).alipay_fund_trans_uni_transfer_response as Record<string, unknown>
    const keys = await getAlipayTestKeys()
    expect(result).toMatchObject({ code: '10000', out_biz_no: 'PFA_TRANSFER_1', status: 'DEALING' })
    expect(verifyRsa2(JSON.stringify(result), body(response).sign as string, keys.alipayPublicKey)).toBe(true)
    expect(getAlipayTransferState().orders.find('PFA_TRANSFER_1')).toMatchObject({ amount: '123.45' })
  })

  it('查单返回计划推进后的失败原因和原金额', async () => {
    plugin.upsertRunPlan('RUN001', [
      { accountNo: 'mock1@example.com', status: 'FAIL', errorCode: 'MOCK_FAIL', errorMsg: '模拟失败' },
    ])
    await create()
    await plugin.applyRunOutcomes('RUN001', false)
    const response = await request(ALIPAY_TRANSFER_METHODS.query, {
      out_biz_no: 'PFA_TRANSFER_1',
      product_code: 'TRANS_ACCOUNT_NO_PWD',
      biz_scene: 'DIRECT_TRANSFER',
    })
    expect(body(response).alipay_fund_trans_common_query_response).toMatchObject({
      code: '10000',
      status: 'FAIL',
      trans_amount: '123.45',
      fail_reason: '模拟失败',
    })
  })

  it('按运行计划通过HTTP发送成功和失败通知，处理中不通知', async () => {
    const received: Array<Record<string, string>> = []
    let server: Server | undefined
    try {
      server = createServer((req, res) => {
        let content = ''
        req.on('data', (chunk) => (content += chunk))
        req.on('end', () => {
          received.push(Object.fromEntries(new URLSearchParams(content)))
          res.end('success')
        })
      })
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('测试服务器启动失败')
      getAlipayTransferState().updateSettings({ notifyUrl: `http://127.0.0.1:${address.port}/notify` })
      plugin.upsertRunPlan('RUN002', [
        { accountNo: 'success@example.com', status: 'SUCCESS' },
        { accountNo: 'fail@example.com', status: 'FAIL', errorMsg: '模拟失败' },
        { accountNo: 'processing@example.com', status: 'DEALING' },
      ])
      await create('SYS_SUCCESS', 'success@example.com')
      await create('SYS_FAIL', 'fail@example.com')
      await create('SYS_PROCESS', 'processing@example.com')
      const applied = await plugin.applyRunOutcomes('RUN002', true, { min: 0, max: 0 })
      expect(applied.expectedNotificationCount).toBe(2)
      expect(applied.notifications).toHaveLength(2)
      expect(applied.notifications.every((item) => item.success)).toBe(true)
      expect(received.find((item) => item.tradeNo === 'SYS_SUCCESS')).toEqual(
        expect.objectContaining({ paySt: 'SUCCESS', money: '12345' }),
      )
      expect(received.find((item) => item.tradeNo === 'SYS_FAIL')).toEqual(
        expect.objectContaining({ paySt: 'FAIL', money: '12345', msg: '模拟失败' }),
      )
      expect(received.every((item) => !!item.sign)).toBe(true)
      expect(
        received.every((item) => {
          const content = Object.keys(item)
            .filter((key) => key !== 'sign' && item[key] !== '')
            .sort()
            .map((key) => `${key}=${item[key]}`)
            .join('&')
          const expected = createHash('md5').update(`${content}&key=mock-alipay-transfer-callback-secret`).digest('hex')
          return item.sign === expected
        }),
      ).toBe(true)
    } finally {
      if (server)
        await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it('验证运行计划与回调抖动参数', () => {
    expect(validateTransferRunPlan({ outcomes: [{ accountNo: 'a@example.com', status: 'SUCCESS' }] })).toEqual([
      { accountNo: 'a@example.com', status: 'SUCCESS', errorCode: undefined, errorMsg: undefined },
    ])
    expect(validateTransferRunApply({ callbackDelayMinMs: 10, callbackDelayMaxMs: 20 })).toEqual({
      notify: true,
      callbackDelayMinMs: 10,
      callbackDelayMaxMs: 20,
    })
    expect(() => validateTransferRunPlan({ outcomes: [{ accountNo: 'a', status: 'CLOSED' }] })).toThrow('status错误')
  })

  it('允许第二阶段计划按唯一收款账号收敛原订单，并拒绝活动计划账号冲突', async () => {
    plugin.upsertRunPlan('PHASE001', [{ accountNo: 'resume@example.com', status: 'DEALING' }])
    await create('SYS_RESUME', 'resume@example.com')
    expect(plugin.deleteRunPlan('PHASE001')).toBe(true)

    plugin.upsertRunPlan('PHASE002', [{ accountNo: 'resume@example.com', status: 'SUCCESS' }])
    expect(plugin.getRunSummary('PHASE002')?.orderNos).toEqual(['SYS_RESUME'])
    expect(() => plugin.upsertRunPlan('PHASE003', [{ accountNo: 'resume@example.com', status: 'FAIL' }])).toThrow(
      '收款账号已被运行计划PHASE002占用',
    )
  })
})
