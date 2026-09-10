import { addOrder } from '@mock/upstreams/okx-c2c/control'

export default defineEventHandler(async (event) => {
  try {
    return addOrder(await readBody(event))
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
