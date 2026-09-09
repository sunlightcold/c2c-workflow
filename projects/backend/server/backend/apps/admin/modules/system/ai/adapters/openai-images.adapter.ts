import { BadGatewayException, Injectable } from '@nestjs/common'
import {
  AiGatewayRequest,
  AiImageGenerationRequest,
  AiProtocolAdapter,
  AiResult,
  ResolvedAiRoute,
} from '../ai.types'
import { OpenAiAdapterBase } from './openai-adapter-base'

@Injectable()
export class OpenAiImagesAdapter extends OpenAiAdapterBase implements AiProtocolAdapter {
  async execute(request: AiGatewayRequest, route: ResolvedAiRoute): Promise<AiResult> {
    if (!('prompt' in request)) {
      throw new BadGatewayException(`OpenAI Images does not support ${request.capability}`)
    }
    return this.executeImageGeneration(request, route)
  }

  private async executeImageGeneration(
    request: AiImageGenerationRequest,
    route: ResolvedAiRoute,
  ): Promise<AiResult> {
    const options = request.options ?? {}
    const sourceImages = request.sourceImages ?? []
    const response = await this.transport.post(
      this.buildCall(route, sourceImages.length ? 'images/edits' : 'images/generations', {
        model: route.model.upstreamModel,
        prompt: request.prompt,
        ...(sourceImages.length
          ? {
              images: sourceImages.map((image) => ({
                image_url:
                  image.kind === 'url'
                    ? image.url
                    : `data:${image.mimeType};base64,${image.data.toString('base64')}`,
              })),
            }
          : {}),
        ...(options.background ? { background: options.background } : {}),
        ...(options.outputFormat ? { output_format: options.outputFormat } : {}),
        ...(options.quality ? { quality: options.quality } : {}),
        ...(options.size ? { size: options.size } : {}),
      }),
    )
    const record = this.asRecord(response)
    const values = Array.isArray(record.data) ? record.data : []
    const mimeType = this.toMimeType(options.outputFormat)
    const images = values.flatMap((value) => {
      const image = this.asRecord(value)
      const url = this.readString(image.url)
      const base64 = this.readString(image.b64_json)
      return url || base64
        ? [{ mimeType, ...(url ? { url } : {}), ...(base64 ? { base64 } : {}) }]
        : []
    })
    if (images.length === 0)
      throw new BadGatewayException('OpenAI Images response contains no image')
    const usage = this.readUsage(record.usage)
    return { type: 'images', images, ...(usage ? { usage } : {}) }
  }

  private toMimeType(format: string | undefined): string {
    return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  }
}
