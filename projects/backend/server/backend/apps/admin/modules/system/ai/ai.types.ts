export { AiAdapterCode, AiCapability } from '@/common/models'
import type { AiAdapterCode, AiCapability } from '@/common/models'

export enum AiCallLogStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

export type AiMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; url: string; mimeType?: string }

export interface AiMessage {
  role: 'assistant' | 'system' | 'user'
  content: AiMessageContent[]
}

export interface AiRouteTarget {
  channelCode: string
  modelCode: string
}

interface AiRequestBase {
  capability: AiCapability
  featureCode: string
  routeTarget?: AiRouteTarget
  context?: {
    requestId?: string
    userId?: string
  }
}

export interface AiCompletionRequest extends AiRequestBase {
  capability: AiCapability.TEXT_COMPLETION | AiCapability.VISION_UNDERSTANDING
  messages: AiMessage[]
  temperature?: number
}

export type AiImageSource =
  | { kind: 'url'; url: string; mimeType?: string }
  | { kind: 'inline'; data: Buffer; mimeType: string }

export interface AiImageGenerationRequest extends AiRequestBase {
  capability: AiCapability.IMAGE_GENERATION
  prompt: string
  sourceImages?: AiImageSource[]
  options?: {
    aspectRatio?: string
    background?: 'auto' | 'opaque' | 'transparent'
    outputFormat?: 'jpeg' | 'png' | 'webp'
    quality?: string
    size?: string
  }
}

export type AiGatewayRequest = AiCompletionRequest | AiImageGenerationRequest

export interface AiUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface AiTextResult {
  type: 'text'
  text: string
  usage?: AiUsage
}

export interface AiGeneratedImage {
  base64?: string
  mimeType: string
  url?: string
}

export interface AiImageResult {
  type: 'images'
  images: AiGeneratedImage[]
  usage?: AiUsage
}

export type AiResult = AiImageResult | AiTextResult

export interface ResolvedAiChannel {
  adapterCode: AiAdapterCode
  apiKey: string
  baseUrl: string
  code: string
  maxConcurrency: number
  maxQueuedRequests: number
  timeoutMs: number
}

export interface ResolvedAiModel {
  adapterCode: AiAdapterCode
  code: string
  name: string
  upstreamModel: string
}

export interface ResolvedAiRoute {
  channel: ResolvedAiChannel
  model: ResolvedAiModel
}

export interface AiRouteTargetView {
  adapterCode: AiAdapterCode
  channelCode: string
  maxConcurrency: number
  maxQueuedRequests: number
  modelCode: string
  modelName: string
}

export interface AiRouteResolver {
  resolve: (
    featureCode: string,
    capability: AiCapability,
    routeTarget?: AiRouteTarget,
  ) => Promise<ResolvedAiRoute[]>
}

export interface AiProtocolAdapter {
  execute: (request: AiGatewayRequest, route: ResolvedAiRoute) => Promise<AiResult>
}

export interface AiAdapterRegistry {
  get: (adapterCode: AiAdapterCode) => AiProtocolAdapter
}
