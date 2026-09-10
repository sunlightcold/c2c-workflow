import { getAlipayTransferPlugin } from '@mock/upstreams/alipay-transfer/plugin'

export default defineEventHandler(async (event) => {
  try {
    return await getAlipayTransferPlugin().sendNotify(getRouterParam(event, 'outBizNo') ?? '')
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
