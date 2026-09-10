import { validateSettingsPatch } from '@mock/upstreams/binance-c2c/control'
import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'

export default defineEventHandler(async (event) => {
  try {
    return { settings: getBinanceC2cState().updateSettings(validateSettingsPatch(await readBody(event))) }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
