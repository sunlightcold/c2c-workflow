import type { MockGatewayRequest, MockGatewayResponse, UpstreamMockPlugin } from './contracts'

export class PluginRegistry {
  private readonly pluginsByMethod = new Map<string, UpstreamMockPlugin>()

  register(plugin: UpstreamMockPlugin) {
    for (const method of plugin.methods) {
      const existing = this.pluginsByMethod.get(method)
      if (existing && existing.id !== plugin.id) {
        throw new Error(`Mock method ${method} is already registered by ${existing.id}`)
      }
      this.pluginsByMethod.set(method, plugin)
    }
    return this
  }

  async dispatch(request: MockGatewayRequest): Promise<MockGatewayResponse> {
    const plugin = this.pluginsByMethod.get(request.method)
    if (!plugin) {
      return {
        status: 404,
        body: { code: 'MOCK_METHOD_NOT_FOUND', message: `No mock plugin handles ${request.method}` },
      }
    }
    return plugin.handle(request)
  }

  describe() {
    const result = new Map<string, string[]>()
    for (const [method, plugin] of this.pluginsByMethod) {
      const methods = result.get(plugin.id) ?? []
      methods.push(method)
      result.set(plugin.id, methods)
    }
    return [...result].map(([id, methods]) => ({ id, methods }))
  }
}
