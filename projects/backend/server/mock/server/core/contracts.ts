export interface MockGatewayRequest {
  method: string
  params: Record<string, string>
  headers: Headers
  origin?: string
}

export interface MockGatewayResponse {
  status?: number
  headers?: Record<string, string>
  body: unknown
}

/** Contract implemented by every upstream protocol plugin. */
export interface UpstreamMockPlugin {
  readonly id: string
  readonly methods: readonly string[]
  handle(request: MockGatewayRequest): Promise<MockGatewayResponse>
}
