import { BadGatewayException, Injectable } from '@nestjs/common'
import {
  AiGatewayRequest,
  AiGeneratedImage,
  AiImageGenerationRequest,
  AiImageSource,
  AiMessageContent,
  AiProtocolAdapter,
  AiResult,
  ResolvedAiRoute,
} from '../ai.types'
import { AiHttpAdapter } from '../ai-transport'

@Injectable()
export class GeminiGenerateContentAdapter extends AiHttpAdapter implements AiProtocolAdapter {
  async execute(request: AiGatewayRequest, route: ResolvedAiRoute): Promise<AiResult> {
    const body =
      'messages' in request
        ? this.buildCompletionBody(request.messages)
        : this.buildImageBody(request)
    const response = await this.transport.post({
      body,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': route.channel.apiKey },
      timeoutMs: route.channel.timeoutMs,
      url: this.buildUrl(route.channel.baseUrl, route.model.upstreamModel),
    })
    return 'messages' in request
      ? this.readTextResult(response)
      : this.readImageResult(response, request)
  }

  private buildCompletionBody(
    messages: Extract<AiGatewayRequest, { messages: unknown }>['messages'],
  ) {
    const systemParts = messages
      .filter(({ role }) => role === 'system')
      .flatMap(({ content }) => content)
      .filter((part): part is Extract<AiMessageContent, { type: 'text' }> => part.type === 'text')
      .map(({ text }) => ({ text }))
    const contents = messages
      .filter(({ role }) => role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: message.content.map((part) => this.toGeminiPart(part)),
      }))
    return {
      contents,
      ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
    }
  }

  private buildImageBody(request: AiImageGenerationRequest) {
    const imageConfig = {
      ...(request.options?.aspectRatio ? { aspectRatio: request.options.aspectRatio } : {}),
      ...(request.options?.quality ? { imageSize: request.options.quality } : {}),
    }
    return {
      contents: [
        {
          role: 'user',
          parts: [
            { text: request.prompt },
            ...(request.sourceImages ?? []).map((image) => this.toGeminiImagePart(image)),
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
      },
    }
  }

  private toGeminiImagePart(image: AiImageSource): Record<string, unknown> {
    if (image.kind === 'inline') {
      return {
        inlineData: {
          data: image.data.toString('base64'),
          mimeType: image.mimeType,
        },
      }
    }
    return this.toGeminiPart({ type: 'image_url', url: image.url, mimeType: image.mimeType })
  }

  private toGeminiPart(part: AiMessageContent): Record<string, unknown> {
    if (part.type === 'text') return { text: part.text }
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(part.url)
    if (match) return { inlineData: { data: match[2], mimeType: match[1] } }
    return {
      fileData: {
        fileUri: part.url,
        ...(part.mimeType ? { mimeType: part.mimeType } : {}),
      },
    }
  }

  private readTextResult(response: unknown): AiResult {
    const record = this.asRecord(response)
    const text = this.readParts(record)
      .map((part) => this.readString(this.asRecord(part).text) ?? '')
      .join('')
      .trim()
    if (!text) throw new BadGatewayException('Gemini generateContent response contains no text')
    const usage = this.readUsage(record.usageMetadata)
    return { type: 'text', text, ...(usage ? { usage } : {}) }
  }

  private readImageResult(response: unknown, request: AiImageGenerationRequest): AiResult {
    const record = this.asRecord(response)
    const fallbackMimeType = this.toMimeType(request.options?.outputFormat)
    const images = this.readParts(record).flatMap<AiGeneratedImage>((partValue) => {
      const part = this.asRecord(partValue)
      const inlineData = this.asRecord(part.inlineData ?? part.inline_data)
      const base64 = this.readString(inlineData.data)
      if (base64) {
        return [
          {
            base64,
            mimeType:
              this.readString(inlineData.mimeType ?? inlineData.mime_type) ?? fallbackMimeType,
          },
        ]
      }
      const fileData = this.asRecord(part.fileData ?? part.file_data)
      const url = this.readString(fileData.fileUri ?? fileData.file_uri)
      return url
        ? [
            {
              url,
              mimeType:
                this.readString(fileData.mimeType ?? fileData.mime_type) ?? fallbackMimeType,
            },
          ]
        : []
    })
    if (images.length === 0) {
      throw new BadGatewayException('Gemini generateContent response contains no image')
    }
    const usage = this.readUsage(record.usageMetadata)
    return { type: 'images', images, ...(usage ? { usage } : {}) }
  }

  private buildUrl(baseUrl: string, model: string): string {
    const base = baseUrl.replace(/\/+$/, '')
    if (base.includes(':generateContent')) return base
    const encodedModel = encodeURIComponent(model).replace(/%2F/g, '/')
    if (base.endsWith('/models')) return `${base}/${encodedModel}:generateContent`
    if (/\/v\d+(alpha|beta)?$/.test(base)) return `${base}/models/${encodedModel}:generateContent`
    return `${base}/v1beta/models/${encodedModel}:generateContent`
  }

  private readParts(record: Record<string, unknown>): unknown[] {
    const candidates = Array.isArray(record.candidates) ? record.candidates : []
    const parts = this.asRecord(this.asRecord(candidates[0]).content).parts
    return Array.isArray(parts) ? parts : []
  }

  private readUsage(value: unknown) {
    const usage = this.asRecord(value)
    const inputTokens = this.readNumber(usage.promptTokenCount)
    const outputTokens = this.readNumber(usage.candidatesTokenCount)
    const totalTokens = this.readNumber(usage.totalTokenCount)
    return inputTokens === undefined && outputTokens === undefined && totalTokens === undefined
      ? undefined
      : { inputTokens, outputTokens, totalTokens }
  }

  private toMimeType(format: string | undefined): string {
    return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  }
}
