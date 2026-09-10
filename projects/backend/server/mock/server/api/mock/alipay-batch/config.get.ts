import { getLocalAlipayConfig } from '@mock/upstreams/alipay-batch/control'

export default defineEventHandler((event) => getLocalAlipayConfig(getRequestURL(event).origin))
