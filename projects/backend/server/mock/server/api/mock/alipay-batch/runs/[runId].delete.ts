import { validateRunId } from '@mock/upstreams/alipay-batch/control'
import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'

export default defineEventHandler((event) => {
  try {
    const runId = validateRunId(getRouterParam(event, 'runId') ?? '')
    return { runId, deleted: getAlipayBatchPlugin().deleteRunPlan(runId) }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '运行计划错误' })
  }
})
