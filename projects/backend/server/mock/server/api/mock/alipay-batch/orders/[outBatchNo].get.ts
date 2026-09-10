import { getAlipayBatchState } from '@mock/upstreams/alipay-batch/state'

export default defineEventHandler((event) => {
  const outBatchNo = getRouterParam(event, 'outBatchNo') ?? ''
  const order = getAlipayBatchState().orders.find(outBatchNo)
  if (!order) throw createError({ statusCode: 404, statusMessage: '订单不存在' })
  return order
})
