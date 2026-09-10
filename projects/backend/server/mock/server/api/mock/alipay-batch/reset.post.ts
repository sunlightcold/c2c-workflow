import { getAlipayBatchState } from '@mock/upstreams/alipay-batch/state'

export default defineEventHandler(() => getAlipayBatchState().reset())
