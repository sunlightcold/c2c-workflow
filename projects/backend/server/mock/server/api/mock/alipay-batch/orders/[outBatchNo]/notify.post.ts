import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'

export default defineEventHandler(async (event) => {
  const outBatchNo = getRouterParam(event, 'outBatchNo') ?? ''
  const body = (await readBody<{ notifyUrl?: string } | undefined>(event)) ?? {}
  try {
    return await getAlipayBatchPlugin().sendNotify(outBatchNo, body.notifyUrl)
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
