import { getAlipayTransferState } from '@mock/upstreams/alipay-transfer/state'

export default defineEventHandler((event) => {
  const outBizNo = getRouterParam(event, 'outBizNo') ?? ''
  const order = getAlipayTransferState().orders.find(outBizNo)
  if (!order) throw createError({ statusCode: 404, statusMessage: '订单不存在' })
  return order
})
