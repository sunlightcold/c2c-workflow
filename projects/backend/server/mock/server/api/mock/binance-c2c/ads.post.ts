import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'
import { validateMockAd } from '@mock/upstreams/c2c-ad/mock-ad'

export default defineEventHandler(async (event) => {
  try {
    return getBinanceC2cState().ads.insert(validateMockAd(await readBody(event)))
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
