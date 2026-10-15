import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

export default defineEventHandler(() => ({ deletedAds: getOkxC2cState().ads.clear() }))
