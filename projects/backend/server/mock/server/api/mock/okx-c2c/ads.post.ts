import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'
import { validateMockAd } from '@mock/upstreams/c2c-ad/mock-ad'

export default defineEventHandler(async (event) => {
  try {
    return getOkxC2cState().ads.insert(validateMockAd(await readBody(event)))
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
