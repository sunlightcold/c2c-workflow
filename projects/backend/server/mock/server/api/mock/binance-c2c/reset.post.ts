import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'

export default defineEventHandler(() => getBinanceC2cState().reset())
