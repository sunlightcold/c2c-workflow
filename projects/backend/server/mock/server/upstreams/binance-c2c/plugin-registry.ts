import { getBinanceC2cState } from './state'
import { BinanceC2cMockPlugin } from './plugin'

const pluginKey = Symbol.for('to-pay.mock.binance-c2c.plugin')

export function getBinanceC2cPlugin() {
  const globals = globalThis as typeof globalThis & { [pluginKey]?: BinanceC2cMockPlugin }
  globals[pluginKey] ??= new BinanceC2cMockPlugin(
    () => getBinanceC2cState().getSettings(),
    () => getBinanceC2cState().orders.list(),
    (id) => getBinanceC2cState().orders.find(id),
    (id, updater) => getBinanceC2cState().orders.update(id, updater),
  )
  return globals[pluginKey]
}
