import { getOkxC2cState } from './state'
import { OkxC2cMockPlugin } from './plugin'

const pluginKey = Symbol.for('to-pay.mock.okx-c2c.plugin')

export function getOkxC2cPlugin() {
  const globals = globalThis as typeof globalThis & { [pluginKey]?: OkxC2cMockPlugin }
  globals[pluginKey] ??= new OkxC2cMockPlugin(
    () => getOkxC2cState().getSettings(),
    () => getOkxC2cState().orders.list(),
    (id) => getOkxC2cState().orders.list().find((order) => order.id === id || order.publicTradingOrderId === id),
    (id, updater) => {
      const order = getOkxC2cState().orders.list().find((item) => item.id === id || item.publicTradingOrderId === id)
      return order ? getOkxC2cState().orders.update(order.id, updater) : undefined
    },
  )
  return globals[pluginKey]
}
