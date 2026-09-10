import { getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'

export default defineEventHandler((event) => ({
  plugin: 'binance-c2c',
  gateway: getRequestURL(event).origin,
  settings: getBinanceC2cState().getSettings(),
}))
