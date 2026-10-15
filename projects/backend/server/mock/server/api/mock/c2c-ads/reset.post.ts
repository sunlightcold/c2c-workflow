import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'
import { getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

export default defineEventHandler(() => ({
  binance: getBinanceC2cState().resetAds(),
  okx: getOkxC2cState().resetAds(),
}))
