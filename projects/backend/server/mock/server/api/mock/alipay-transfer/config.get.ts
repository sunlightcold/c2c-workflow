import { getLocalAlipayTransferConfig } from '@mock/upstreams/alipay-transfer/control'

export default defineEventHandler((event) => getLocalAlipayTransferConfig(getRequestURL(event).origin))
