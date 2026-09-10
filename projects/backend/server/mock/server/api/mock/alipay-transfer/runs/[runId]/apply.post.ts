import { validateTransferRunApply, validateTransferRunId } from '@mock/upstreams/alipay-transfer/control'
import { getAlipayTransferPlugin } from '@mock/upstreams/alipay-transfer/plugin'

export default defineEventHandler(async (event) => {
  try {
    const runId = validateTransferRunId(getRouterParam(event, 'runId') ?? '')
    const options = validateTransferRunApply((await readBody(event)) ?? {})
    return await getAlipayTransferPlugin().applyRunOutcomes(runId, options.notify, {
      min: options.callbackDelayMinMs,
      max: options.callbackDelayMaxMs,
    })
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '应用运行计划失败' })
  }
})
