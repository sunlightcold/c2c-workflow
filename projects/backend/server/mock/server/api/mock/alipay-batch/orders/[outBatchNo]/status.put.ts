import { validateStatusPatch } from '@mock/upstreams/alipay-batch/control'
import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'

export default defineEventHandler(async (event) => {
  const outBatchNo = getRouterParam(event, 'outBatchNo') ?? ''
  try {
    const patch = validateStatusPatch(await readBody(event))
    const order = getAlipayBatchPlugin().updateOrderStatus(outBatchNo, patch)
    if (!order) throw createError({ statusCode: 404, statusMessage: '订单不存在' })
    const notification = patch.notify
      ? await getAlipayBatchPlugin().sendNotify(outBatchNo, patch.notifyUrl)
      : undefined
    return { order, notification }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
