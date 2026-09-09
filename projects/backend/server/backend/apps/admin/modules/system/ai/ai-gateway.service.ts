import { BadGatewayException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { AiCapability } from '@/common/models'
import {
  AiAdapterRegistry,
  AiCallLogStatus,
  AiGatewayRequest,
  AiResult,
  AiRouteResolver,
  AiRouteTarget,
  AiRouteTargetView,
  ResolvedAiRoute,
} from './ai.types'
import { AiUpstreamRequestError } from './ai-transport'
import type { AiCallLogService } from './ai-call-log.service'

export const AI_ROUTE_RESOLVER = Symbol('AI_ROUTE_RESOLVER')
export const AI_ADAPTER_REGISTRY = Symbol('AI_ADAPTER_REGISTRY')
export const AI_CALL_LOG_SERVICE = Symbol('AI_CALL_LOG_SERVICE')

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name)

  constructor(
    @Inject(AI_ROUTE_RESOLVER) private readonly routeResolver: AiRouteResolver,
    @Inject(AI_ADAPTER_REGISTRY) private readonly adapterRegistry: AiAdapterRegistry,
    @Optional()
    @Inject(AI_CALL_LOG_SERVICE)
    private readonly callLogService?: Pick<AiCallLogService, 'record'>,
  ) {}

  async execute(request: AiGatewayRequest): Promise<AiResult> {
    const routes = await this.routeResolver.resolve(
      request.featureCode,
      request.capability,
      request.routeTarget,
    )
    if (routes.length === 0) {
      throw new BadGatewayException(`AI feature has no available route: ${request.featureCode}`)
    }

    let lastRetryableError: AiUpstreamRequestError | undefined
    for (const [index, route] of routes.entries()) {
      const startedAt = new Date()
      try {
        const result = await this.adapterRegistry
          .get(route.model.adapterCode)
          .execute(request, route)
        await this.recordCall({
          adapterCode: route.model.adapterCode,
          attempt: index + 1,
          capability: request.capability,
          channelCode: route.channel.code,
          durationMs: Date.now() - startedAt.getTime(),
          endedAt: new Date(),
          featureCode: request.featureCode,
          inputTokens: result.usage?.inputTokens,
          modelCode: route.model.code,
          outputTokens: result.usage?.outputTokens,
          requestId: request.context?.requestId,
          startedAt,
          status: AiCallLogStatus.SUCCESS,
          totalTokens: result.usage?.totalTokens,
          userId: request.context?.userId,
        })
        return result
      } catch (error: unknown) {
        await this.recordCall({
          adapterCode: route.model.adapterCode,
          attempt: index + 1,
          capability: request.capability,
          channelCode: route.channel.code,
          durationMs: Date.now() - startedAt.getTime(),
          endedAt: new Date(),
          errorMessage: this.errorMessage(error),
          errorType: error instanceof Error ? error.name : typeof error,
          featureCode: request.featureCode,
          modelCode: route.model.code,
          requestId: request.context?.requestId,
          startedAt,
          status: AiCallLogStatus.FAILED,
          userId: request.context?.userId,
        })
        this.logRouteFailure(request, route, error)
        if (!(error instanceof AiUpstreamRequestError) || !error.retryable) throw error
        lastRetryableError = error
      }
    }
    throw new BadGatewayException(
      `All AI routes failed for feature: ${request.featureCode}`,
      lastRetryableError ? { cause: lastRetryableError } : undefined,
    )
  }

  async listTargets(featureCode: string, capability: AiCapability): Promise<AiRouteTargetView[]> {
    const routes = await this.routeResolver.resolve(featureCode, capability)
    return routes.map((route) => this.toTargetView(route))
  }

  async resolveTarget(
    featureCode: string,
    capability: AiCapability,
    modelCode?: string,
  ): Promise<AiRouteTargetView> {
    const targets = await this.listTargets(featureCode, capability)
    const target = modelCode
      ? targets.find((candidate) => candidate.modelCode === modelCode)
      : targets[0]
    if (!target) {
      throw new BadGatewayException(
        modelCode
          ? `AI feature has no available route for model: ${featureCode}/${modelCode}`
          : `AI feature has no available route: ${featureCode}`,
      )
    }
    return target
  }

  async resolveExecutionRoute(
    featureCode: string,
    capability: AiCapability,
    routeTarget: AiRouteTarget,
  ): Promise<ResolvedAiRoute> {
    const routes = await this.routeResolver.resolve(featureCode, capability, routeTarget)
    const route = routes[0]
    if (!route) {
      throw new BadGatewayException(
        `AI feature has no available route target: ${featureCode}/${routeTarget.channelCode}/${routeTarget.modelCode}`,
      )
    }
    return route
  }

  private toTargetView(route: ResolvedAiRoute): AiRouteTargetView {
    return {
      adapterCode: route.model.adapterCode,
      channelCode: route.channel.code,
      maxConcurrency: route.channel.maxConcurrency,
      maxQueuedRequests: route.channel.maxQueuedRequests,
      modelCode: route.model.code,
      modelName: route.model.name,
    }
  }

  private logRouteFailure(request: AiGatewayRequest, route: ResolvedAiRoute, error: unknown): void {
    const upstreamError = error instanceof AiUpstreamRequestError ? error : undefined
    this.logger.warn(
      `AI route failed: ${JSON.stringify({
        event: 'ai_route_failed',
        featureCode: request.featureCode,
        channelCode: route.channel.code,
        modelCode: route.model.code,
        adapterCode: route.model.adapterCode,
        status: upstreamError?.status,
        retryable: upstreamError?.retryable ?? false,
        reason: error instanceof Error ? error.message : String(error),
      })}`,
    )
  }

  private async recordCall(input: Parameters<AiCallLogService['record']>[0]): Promise<void> {
    if (!this.callLogService) return
    try {
      await this.callLogService.record({
        ...input,
        errorMessage: input.errorMessage?.slice(0, 2048),
      })
    } catch (error: unknown) {
      this.logger.error(`AI call log failed: ${this.errorMessage(error)}`)
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
