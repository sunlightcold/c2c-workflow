import { getPluginRegistry } from '@mock/core/runtime'

export default defineEventHandler(() => ({
  status: 'ok',
  plugins: getPluginRegistry().describe(),
  timestamp: new Date().toISOString(),
}))
