import { validateRunId } from '@mock/upstreams/alipay-batch/control'
import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'

export default defineEventHandler((event) => {
  try {
    const runId = validateRunId(getRouterParam(event, 'runId') ?? '')
    const summary = getAlipayBatchPlugin().getRunSummary(runId)
    if (!summary) throw createError({ statusCode: 404, statusMessage: '运行计划不存在' })
    return summary
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '运行计划错误' })
  }
})
