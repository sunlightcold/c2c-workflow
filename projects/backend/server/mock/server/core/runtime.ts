import { getAlipayBatchPlugin } from '@mock/upstreams/alipay-batch/plugin'
import { getAlipayTransferPlugin } from '@mock/upstreams/alipay-transfer/plugin'
import { PluginRegistry } from './plugin-registry'

const registryKey = Symbol.for('to-pay.mock.plugin-registry')

export function getPluginRegistry(): PluginRegistry {
  const globals = globalThis as typeof globalThis & { [registryKey]?: PluginRegistry }
  if (!globals[registryKey]) {
    globals[registryKey] = new PluginRegistry().register(getAlipayBatchPlugin()).register(getAlipayTransferPlugin())
  }
  return globals[registryKey]
}
