import { getAlipayTransferState } from '@mock/upstreams/alipay-transfer/state'

export default defineEventHandler(() => {
  const orders = getAlipayTransferState()
    .orders.list()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { total: orders.length, data: orders }
})
