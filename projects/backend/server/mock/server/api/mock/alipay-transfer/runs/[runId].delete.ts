import { validateTransferRunId } from '@mock/upstreams/alipay-transfer/control'
import { getAlipayTransferPlugin } from '@mock/upstreams/alipay-transfer/plugin'

export default defineEventHandler((event) => {
  try {
    const runId = validateTransferRunId(getRouterParam(event, 'runId') ?? '')
    return { deleted: getAlipayTransferPlugin().deleteRunPlan(runId) }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : '运行计划错误' })
  }
})
