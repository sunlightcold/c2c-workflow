import { validateTransferRunId } from '@mock/upstreams/alipay-transfer/control'
import { getAlipayTransferPlugin } from '@mock/upstreams/alipay-transfer/plugin'

export default defineEventHandler((event) => {
  try {
    const runId = validateTransferRunId(getRouterParam(event, 'runId') ?? '')
    const summary = getAlipayTransferPlugin().getRunSummary(runId)
    if (!summary) throw createError({ statusCode: 404, statusMessage: '运行计划不存在' })
    return summary
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '运行计划错误' })
  }
})
