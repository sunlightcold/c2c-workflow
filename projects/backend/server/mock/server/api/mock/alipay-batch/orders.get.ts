import { getAlipayBatchState } from '@mock/upstreams/alipay-batch/state'

export default defineEventHandler(() => {
  const orders = getAlipayBatchState().orders.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { total: orders.length, data: orders }
})
