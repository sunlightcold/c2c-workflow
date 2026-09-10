import { validateSettingsPatch } from '@mock/upstreams/alipay-batch/control'
import { getAlipayBatchState } from '@mock/upstreams/alipay-batch/state'

export default defineEventHandler(async (event) => {
  try {
    const patch = validateSettingsPatch(await readBody(event))
    return { settings: getAlipayBatchState().updateSettings(patch) }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
