import { validateTransferSettingsPatch } from '@mock/upstreams/alipay-transfer/control'
import { getAlipayTransferState } from '@mock/upstreams/alipay-transfer/state'

export default defineEventHandler(async (event) => {
  try {
    const patch = validateTransferSettingsPatch(await readBody(event))
    return { settings: getAlipayTransferState().updateSettings(patch) }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
