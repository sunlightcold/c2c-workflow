import { getAlipayTestKeys } from '../alipay-batch/key-store'
import { APP_ID } from './plugin'
import { getAlipayTransferState } from './state'
import type { AlipayTransferRunOutcome, AlipayTransferSettings, AlipayTransferStatus } from './types'
import { ALIPAY_TRANSFER_METHODS } from './types'

const statuses = new Set<AlipayTransferStatus>(['DEALING', 'SUCCESS', 'FAIL'])

function url(value: unknown) {
  if (value === '') return ''
  if (typeof value !== 'string') throw new Error('notifyUrl必须是字符串')
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('notifyUrl仅支持HTTP或HTTPS')
  return value
}

export function validateTransferSettingsPatch(body: unknown): Partial<AlipayTransferSettings> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('配置参数必须是JSON对象')
  const input = body as Record<string, unknown>
  const patch: Partial<AlipayTransferSettings> = {}
  if ('verifyRequestSign' in input) {
    if (typeof input.verifyRequestSign !== 'boolean') throw new Error('verifyRequestSign必须是布尔值')
    patch.verifyRequestSign = input.verifyRequestSign
  }
  if ('notifyUrl' in input) patch.notifyUrl = url(input.notifyUrl)
  if ('callbackSecret' in input) {
    if (typeof input.callbackSecret !== 'string' || !input.callbackSecret.trim()) {
      throw new Error('callbackSecret不能为空')
    }
    patch.callbackSecret = input.callbackSecret
  }
  return patch
}

export function validateTransferRunId(value: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(value)) throw new Error('runId只能包含字母、数字、下划线和中划线，长度6到64位')
  return value
}

export function validateTransferRunApply(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('应用运行计划参数必须是JSON对象')
  const input = body as Record<string, unknown>
  const min = input.callbackDelayMinMs === undefined ? 500 : Number(input.callbackDelayMinMs)
  const max = input.callbackDelayMaxMs === undefined ? 1500 : Number(input.callbackDelayMaxMs)
  if (!Number.isSafeInteger(min) || min < 0) throw new Error('callbackDelayMinMs必须为非负安全整数')
  if (!Number.isSafeInteger(max) || max < min) throw new Error('callbackDelayMaxMs必须大于等于callbackDelayMinMs')
  if (max > 60000) throw new Error('callbackDelayMaxMs不能超过60000毫秒')
  return { notify: input.notify !== false, callbackDelayMinMs: min, callbackDelayMaxMs: max }
}

export function validateTransferRunPlan(body: unknown): AlipayTransferRunOutcome[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('运行计划必须是JSON对象')
  const input = body as Record<string, unknown>
  if (!Array.isArray(input.outcomes) || input.outcomes.length === 0) throw new Error('outcomes不能为空')
  const accounts = new Set<string>()
  return input.outcomes.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`outcomes[${index}]格式错误`)
    const item = value as Record<string, unknown>
    if (typeof item.accountNo !== 'string' || !item.accountNo.trim()) {
      throw new Error(`outcomes[${index}].accountNo不能为空`)
    }
    if (accounts.has(item.accountNo)) throw new Error(`outcomes[${index}].accountNo重复`)
    accounts.add(item.accountNo)
    if (!statuses.has(item.status as AlipayTransferStatus)) throw new Error(`outcomes[${index}].status错误`)
    const status = item.status as AlipayTransferStatus
    return {
      accountNo: item.accountNo,
      status,
      errorCode: status === 'FAIL' ? String(item.errorCode || 'MOCK_PLANNED_FAILURE') : undefined,
      errorMsg: status === 'FAIL' ? String(item.errorMsg || 'Mock计划订单失败') : undefined,
    }
  })
}

export async function getLocalAlipayTransferConfig(origin: string) {
  const keys = await getAlipayTestKeys()
  const settings = getAlipayTransferState().getSettings()
  return {
    plugin: 'alipay-transfer',
    warning: '以下私钥仅用于本地Mock测试，禁止用于生产环境',
    methods: { ...ALIPAY_TRANSFER_METHODS, balance: 'alipay.fund.account.query' },
    mockGateway: `${origin}/api/alipay/gateway`,
    settings,
    pfaParams: {
      appId: APP_ID,
      authMode: 'KEY',
      appKey: settings.callbackSecret,
      privateKey: keys.appPrivateKey,
      alipayPublicKey: keys.alipayPublicKey,
      gateway: process.env.MOCK_ALIPAY_TRANSFER_FORWARDER_GATEWAY ?? 'http://127.0.0.1:3100/v1/gateway/alipay-transfer',
      pfaGatewayUrl: ALIPAY_TRANSFER_METHODS.create,
      queryOrderUrl: ALIPAY_TRANSFER_METHODS.query,
      queryBalanceUrl: 'alipay.fund.account.query',
      userId: '2088000000000000',
    },
  }
}
