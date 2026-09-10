import { validateRunId, validateRunPlan } from '@mock/upstreams/alipay-batch/control'
import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'

export default defineEventHandler(async (event) => {
  try {
    const runId = validateRunId(getRouterParam(event, 'runId') ?? '')
    const outcomes = validateRunPlan(await readBody(event))
    return getAlipayBatchPlugin().upsertRunPlan(runId, outcomes)
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '运行计划错误' })
  }
})
