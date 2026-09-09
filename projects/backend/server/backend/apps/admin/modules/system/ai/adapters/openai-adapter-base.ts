import { AiHttpAdapter } from '../ai-transport'
import type { AiUsage, ResolvedAiRoute } from '../ai.types'

export abstract class OpenAiAdapterBase extends AiHttpAdapter {
  protected buildCall(route: ResolvedAiRoute, path: string, body: Record<string, unknown>) {
    const base = route.channel.baseUrl.replace(/\/+$/, '')
    return {
      body,
      headers: {
        Authorization: `Bearer ${route.channel.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeoutMs: route.channel.timeoutMs,
      url: base.endsWith(`/${path}`)
        ? base
        : base.endsWith('/v1')
          ? `${base}/${path}`
          : `${base}/v1/${path}`,
    }
  }

  protected readUsage(value: unknown): AiUsage | undefined {
    const usage = this.asRecord(value)
    const inputTokens = this.readNumber(usage.prompt_tokens ?? usage.input_tokens)
    const outputTokens = this.readNumber(usage.completion_tokens ?? usage.output_tokens)
    const totalTokens = this.readNumber(usage.total_tokens)
    return inputTokens === undefined && outputTokens === undefined && totalTokens === undefined
      ? undefined
      : { inputTokens, outputTokens, totalTokens }
  }
}
