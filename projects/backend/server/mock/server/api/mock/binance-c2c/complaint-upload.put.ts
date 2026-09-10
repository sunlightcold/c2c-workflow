export default defineEventHandler(async (event) => {
  await readRawBody(event)
  setResponseStatus(event, 200)
  return { ok: true }
})
