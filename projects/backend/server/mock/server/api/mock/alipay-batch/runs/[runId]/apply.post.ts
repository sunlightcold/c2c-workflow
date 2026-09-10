import { validateRunApply, validateRunId } from '@mock/upstreams/alipay-batch/control'
import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'

export default defineEventHandler(async (event) => {
  try {
    const runId = validateRunId(getRouterParam(event, 'runId') ?? '')
    const options = validateRunApply((await readBody(event)) ?? {})
    return await getAlipayBatchPlugin().applyRunOutcomes(runId, options.notify, {
      min: options.callbackDelayMinMs,
      max: options.callbackDelayMaxMs,
    })
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '应用运行计划失败' })
  }
})
