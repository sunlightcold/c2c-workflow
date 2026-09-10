import { validateSettingsPatch } from '@mock/upstreams/okx-c2c/control'
import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

export default defineEventHandler(async (event) => {
  try {
    return { settings: getOkxC2cState().updateSettings(validateSettingsPatch(await readBody(event))) }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
