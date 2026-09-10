import { getAlipayTransferState } from '@mock/upstreams/alipay-transfer/state'

export default defineEventHandler(() => getAlipayTransferState().reset())
