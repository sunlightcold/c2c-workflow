import { AiAdapterCode, AiCapability } from '@/common/models'

const ADAPTER_CAPABILITIES: Readonly<Record<AiAdapterCode, readonly AiCapability[]>> = {
  [AiAdapterCode.OPENAI_CHAT_COMPLETIONS]: [
    AiCapability.TEXT_COMPLETION,
    AiCapability.VISION_UNDERSTANDING,
  ],
  [AiAdapterCode.OPENAI_RESPONSES]: [
    AiCapability.TEXT_COMPLETION,
    AiCapability.VISION_UNDERSTANDING,
  ],
  [AiAdapterCode.OPENAI_IMAGES]: [AiCapability.IMAGE_GENERATION],
  [AiAdapterCode.GEMINI_GENERATE_CONTENT]: [
    AiCapability.TEXT_COMPLETION,
    AiCapability.VISION_UNDERSTANDING,
    AiCapability.IMAGE_GENERATION,
  ],
}

export function adapterSupportsCapability(
  adapterCode: AiAdapterCode,
  capability: AiCapability,
): boolean {
  return ADAPTER_CAPABILITIES[adapterCode].includes(capability)
}
