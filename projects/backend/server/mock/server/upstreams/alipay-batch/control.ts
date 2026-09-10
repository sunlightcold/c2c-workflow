import { getAlipayTestKeys } from './key-store'
import { APP_ID } from './plugin'
import { getAlipayBatchState } from './state'
import type { AlipayBatchDetailStatus, AlipayBatchRunOutcome, AlipayBatchSettings, AlipayBatchStatus } from './types'
import { ALIPAY_BATCH_METHODS } from './types'

const batchStatuses = new Set<AlipayBatchStatus>([
  'INIT',
  'WAIT_PAY',
  'DEALING',
  'SUCCESS',
  'PART_SUCCESS',
  'FAIL',
  'INVALID',
  'DISUSE',
])
const detailStatuses = new Set<AlipayBatchDetailStatus>(['INIT', 'WAIT_PAY', 'DEALING', 'SUCCESS', 'FAIL'])

function money(value: unknown, field: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field}必须是非负金额`)
  return number.toFixed(2)
}

function url(value: unknown) {
  if (value === '') return ''
  if (typeof value !== 'string') throw new Error('notifyUrl必须是字符串')
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('notifyUrl仅支持HTTP或HTTPS')
  return value
}

export function validateSettingsPatch(body: unknown): Partial<AlipayBatchSettings> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('配置参数必须是JSON对象')
  const input = body as Record<string, unknown>
  const patch: Partial<AlipayBatchSettings> = {}
  if ('availableAmount' in input) patch.availableAmount = money(input.availableAmount, 'availableAmount')
  if ('freezeAmount' in input) patch.freezeAmount = money(input.freezeAmount, 'freezeAmount')
  if ('verifyRequestSign' in input) {
    if (typeof input.verifyRequestSign !== 'boolean') throw new Error('verifyRequestSign必须是布尔值')
    patch.verifyRequestSign = input.verifyRequestSign
  }
  if ('createBatchStatus' in input) {
    if (!batchStatuses.has(input.createBatchStatus as AlipayBatchStatus)) throw new Error('createBatchStatus错误')
    patch.createBatchStatus = input.createBatchStatus as AlipayBatchStatus
  }
  if ('createDetailStatus' in input) {
    if (!detailStatuses.has(input.createDetailStatus as AlipayBatchDetailStatus)) {
      throw new Error('createDetailStatus错误')
    }
    patch.createDetailStatus = input.createDetailStatus as AlipayBatchDetailStatus
  }
  if ('autoAdvanceAfterQueries' in input) {
    const count = Number(input.autoAdvanceAfterQueries)
    if (!Number.isInteger(count) || count < 0) throw new Error('autoAdvanceAfterQueries必须是非负整数')
    patch.autoAdvanceAfterQueries = count
  }
  if ('autoAdvanceBatchStatus' in input) {
    if (!batchStatuses.has(input.autoAdvanceBatchStatus as AlipayBatchStatus)) {
      throw new Error('autoAdvanceBatchStatus错误')
    }
    patch.autoAdvanceBatchStatus = input.autoAdvanceBatchStatus as AlipayBatchStatus
  }
  if ('autoAdvanceDetailStatus' in input) {
    if (!detailStatuses.has(input.autoAdvanceDetailStatus as AlipayBatchDetailStatus)) {
      throw new Error('autoAdvanceDetailStatus错误')
    }
    patch.autoAdvanceDetailStatus = input.autoAdvanceDetailStatus as AlipayBatchDetailStatus
  }
  if ('randomDetailFailRate' in input) {
    const rate = Number(input.randomDetailFailRate)
    if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
      throw new Error('randomDetailFailRate必须是0到100之间的整数')
    }
    patch.randomDetailFailRate = rate
  }
  if ('notifyUrl' in input) patch.notifyUrl = url(input.notifyUrl)
  if ('receiptReadyAfterQueries' in input) {
    const count = Number(input.receiptReadyAfterQueries)
    if (!Number.isInteger(count) || count < 1) throw new Error('receiptReadyAfterQueries必须是正整数')
    patch.receiptReadyAfterQueries = count
  }
  if ('receiptFinalStatus' in input) {
    if (input.receiptFinalStatus !== 'SUCCESS' && input.receiptFinalStatus !== 'FAIL') {
      throw new Error('receiptFinalStatus错误')
    }
    patch.receiptFinalStatus = input.receiptFinalStatus
  }
  if ('receiptErrorMessage' in input) {
    if (typeof input.receiptErrorMessage !== 'string') throw new Error('receiptErrorMessage必须是字符串')
    patch.receiptErrorMessage = input.receiptErrorMessage
  }
  return patch
}

export function validateStatusPatch(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('状态参数必须是JSON对象')
  const input = body as Record<string, unknown>
  if (!batchStatuses.has(input.batchStatus as AlipayBatchStatus)) throw new Error('batchStatus错误')
  if (input.detailStatus && !detailStatuses.has(input.detailStatus as AlipayBatchDetailStatus)) {
    throw new Error('detailStatus错误')
  }
  let details:
    | Array<{
        outBizNo: string
        detailStatus: AlipayBatchDetailStatus
        errorCode?: string
        errorMsg?: string
      }>
    | undefined
  if ('details' in input) {
    if (!Array.isArray(input.details)) throw new Error('details必须是数组')
    const outBizNos = new Set<string>()
    details = input.details.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`details[${index}]格式错误`)
      const item = value as Record<string, unknown>
      if (typeof item.outBizNo !== 'string' || !item.outBizNo.trim())
        throw new Error(`details[${index}].outBizNo不能为空`)
      if (outBizNos.has(item.outBizNo)) throw new Error(`details[${index}].outBizNo重复`)
      outBizNos.add(item.outBizNo)
      if (!detailStatuses.has(item.detailStatus as AlipayBatchDetailStatus)) {
        throw new Error(`details[${index}].detailStatus错误`)
      }
      return {
        outBizNo: item.outBizNo,
        detailStatus: item.detailStatus as AlipayBatchDetailStatus,
        errorCode: typeof item.errorCode === 'string' ? item.errorCode : undefined,
        errorMsg: typeof item.errorMsg === 'string' ? item.errorMsg : undefined,
      }
    })
  }
  return {
    batchStatus: input.batchStatus as AlipayBatchStatus,
    detailStatus: input.detailStatus as AlipayBatchDetailStatus | undefined,
    errorCode: typeof input.errorCode === 'string' ? input.errorCode : undefined,
    errorMsg: typeof input.errorMsg === 'string' ? input.errorMsg : undefined,
    details,
    notify: input.notify === true,
    notifyUrl: input.notifyUrl === undefined ? undefined : url(input.notifyUrl),
  }
}

export function validateRunId(value: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(value)) throw new Error('runId只能包含字母、数字、下划线和中划线，长度6到64位')
  return value
}

export function validateRunApply(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('应用运行计划参数必须是JSON对象')
  const input = body as Record<string, unknown>
  const min = input.callbackDelayMinMs === undefined ? 500 : Number(input.callbackDelayMinMs)
  const max = input.callbackDelayMaxMs === undefined ? 1500 : Number(input.callbackDelayMaxMs)
  if (!Number.isSafeInteger(min) || min < 0) throw new Error('callbackDelayMinMs必须为非负安全整数')
  if (!Number.isSafeInteger(max) || max < min) throw new Error('callbackDelayMaxMs必须大于等于callbackDelayMinMs')
  if (max > 60000) throw new Error('callbackDelayMaxMs不能超过60000毫秒')
  return { notify: input.notify !== false, callbackDelayMinMs: min, callbackDelayMaxMs: max }
}

export function validateRunPlan(body: unknown): AlipayBatchRunOutcome[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('运行计划必须是JSON对象')
  const input = body as Record<string, unknown>
  if (!Array.isArray(input.outcomes) || input.outcomes.length === 0) throw new Error('outcomes不能为空')
  const outBizNos = new Set<string>()
  return input.outcomes.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`outcomes[${index}]格式错误`)
    const item = value as Record<string, unknown>
    if (typeof item.outBizNo !== 'string' || !item.outBizNo.trim()) {
      throw new Error(`outcomes[${index}].outBizNo不能为空`)
    }
    if (outBizNos.has(item.outBizNo)) throw new Error(`outcomes[${index}].outBizNo重复`)
    outBizNos.add(item.outBizNo)
    if (!detailStatuses.has(item.status as AlipayBatchDetailStatus)) {
      throw new Error(`outcomes[${index}].status错误`)
    }
    const status = item.status as AlipayBatchDetailStatus
    return {
      outBizNo: item.outBizNo,
      status,
      errorCode:
        status === 'FAIL'
          ? typeof item.errorCode === 'string' && item.errorCode
            ? item.errorCode
            : 'MOCK_PLANNED_FAILURE'
          : undefined,
      errorMsg:
        status === 'FAIL'
          ? typeof item.errorMsg === 'string' && item.errorMsg
            ? item.errorMsg
            : 'Mock计划订单失败'
          : undefined,
    }
  })
}

export async function getLocalAlipayConfig(origin: string) {
  const keys = await getAlipayTestKeys()
  return {
    plugin: 'alipay-batch',
    warning: '以下私钥仅用于本地Mock测试，禁止用于生产环境',
    methods: ALIPAY_BATCH_METHODS,
    settings: getAlipayBatchState().getSettings(),
    pfaParams: {
      mchNo: 'MOCK_ALIPAY_BATCH',
      appId: APP_ID,
      appKey: 'not-used-by-alipay-sdk',
      privateKey: keys.appPrivateKey,
      alipayPublicKey: keys.alipayPublicKey,
      gateway: `${origin}/api/alipay/gateway`,
      pfaGatewayUrl: ALIPAY_BATCH_METHODS.create,
      queryOrderUrl: ALIPAY_BATCH_METHODS.detailQuery,
      closeBatchUrl: ALIPAY_BATCH_METHODS.close,
      queryBalanceUrl: ALIPAY_BATCH_METHODS.balance,
      queryBillReceiptUrl: ALIPAY_BATCH_METHODS.receiptApply,
      queryBillReceiptStatusUrl: ALIPAY_BATCH_METHODS.receiptQuery,
      notifyUrl: getAlipayBatchState().getSettings().notifyUrl,
      userId: '2088000000000000',
      payeeIdentityType: 'ALIPAY_LOGON_ID',
    },
    verification: {
      appPublicKey: keys.appPublicKey,
      alipayPrivateKey: keys.alipayPrivateKey,
    },
  }
}
