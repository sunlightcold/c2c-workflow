import sharp, { type Metadata, type ResizeOptions, type WebpOptions } from 'sharp'

export const DEFAULT_THUMBNAIL_MAX_OUTPUT_BYTES = 200 * 1024

const DEFAULT_WEBP_OPTIONS: WebpOptions = {
  lossless: true,
}

interface ResolvedResizeState {
  width?: number
  height?: number
  inferredFromMetadata: boolean
}

export interface GenerateThumbnailOptions {
  resize?: ResizeOptions
  webp?: WebpOptions
  maxOutputBytes?: number
  minQuality?: number
  qualityStep?: number
  resizeStepRatio?: number
  maxResizeIterations?: number
}

export async function generateThumbnail(
  buffer: Buffer,
  options: GenerateThumbnailOptions = {},
): Promise<Buffer> {
  try {
    const normalizedOptions = normalizeGenerateThumbnailOptions(options)
    const metadata = await sharp(buffer).metadata()
    const initialResizeState = resolveInitialResizeState(normalizedOptions.resize, metadata)
    const initialBuffer = await renderWebp({
      buffer,
      options: normalizedOptions,
      resizeState: initialResizeState,
    })

    if (
      !normalizedOptions.maxOutputBytes ||
      initialBuffer.byteLength <= normalizedOptions.maxOutputBytes
    ) {
      return initialBuffer
    }

    return await compressToMaxOutputBytes({
      buffer,
      metadata,
      options: normalizedOptions,
      initialBuffer,
      initialResizeState,
    })
  } catch (error) {
    console.error(`Error creating thumbnail: ${error.message}`, error.stack)
    throw new Error('Thumbnail generation failed')
  }
}

function normalizeGenerateThumbnailOptions(
  options: GenerateThumbnailOptions,
): Required<GenerateThumbnailOptions> {
  return {
    resize: options.resize ?? {},
    webp: {
      ...DEFAULT_WEBP_OPTIONS,
      ...(options.webp ?? {}),
    },
    maxOutputBytes: options.maxOutputBytes ?? 0,
    minQuality: options.minQuality ?? 45,
    qualityStep: options.qualityStep ?? 10,
    resizeStepRatio: options.resizeStepRatio ?? 0.9,
    maxResizeIterations: options.maxResizeIterations ?? 4,
  }
}

function resolveInitialResizeState(
  resize: ResizeOptions,
  metadata: Metadata,
): ResolvedResizeState | undefined {
  if (typeof resize.width === 'number' || typeof resize.height === 'number') {
    return {
      width: resize.width,
      height: resize.height,
      inferredFromMetadata: false,
    }
  }

  if (typeof metadata.width === 'number' && typeof metadata.height === 'number') {
    return {
      width: metadata.width,
      height: metadata.height,
      inferredFromMetadata: true,
    }
  }

  return undefined
}

async function renderWebp(params: {
  buffer: Buffer
  options: Required<GenerateThumbnailOptions>
  resizeState?: ResolvedResizeState
  webpOverrides?: WebpOptions
}): Promise<Buffer> {
  const { buffer, options, resizeState, webpOverrides = {} } = params
  let transformer = sharp(buffer)
  const resizeOptions = buildResizeOptions(options.resize, resizeState)

  if (resizeOptions) {
    transformer = transformer.resize(resizeOptions)
  }

  return transformer
    .webp({
      ...options.webp,
      ...webpOverrides,
    })
    .toBuffer()
}

function buildResizeOptions(
  resize: ResizeOptions,
  resizeState?: ResolvedResizeState,
): ResizeOptions | undefined {
  if (!resizeState) {
    return Object.keys(resize).length > 0 ? resize : undefined
  }

  if (resizeState.inferredFromMetadata) {
    return {
      fit: 'inside',
      withoutEnlargement: true,
      ...resize,
      width: resizeState.width,
      height: resizeState.height,
    }
  }

  return {
    ...resize,
    width: resizeState.width,
    height: resizeState.height,
  }
}

async function compressToMaxOutputBytes(params: {
  buffer: Buffer
  metadata: Metadata
  options: Required<GenerateThumbnailOptions>
  initialBuffer: Buffer
  initialResizeState?: ResolvedResizeState
}): Promise<Buffer> {
  const { buffer, metadata, options, initialBuffer, initialResizeState } = params
  let bestBuffer = initialBuffer
  let currentResizeState = initialResizeState
  const initialQuality = Math.min(options.webp.quality ?? 90, 90)

  for (
    let resizeIteration = 0;
    resizeIteration <= options.maxResizeIterations;
    resizeIteration += 1
  ) {
    for (
      let quality = initialQuality;
      quality >= options.minQuality;
      quality -= options.qualityStep
    ) {
      const candidateBuffer = await renderWebp({
        buffer,
        options,
        resizeState: currentResizeState,
        webpOverrides: {
          lossless: false,
          nearLossless: false,
          quality,
        },
      })

      if (candidateBuffer.byteLength < bestBuffer.byteLength) {
        bestBuffer = candidateBuffer
      }

      if (candidateBuffer.byteLength <= options.maxOutputBytes) {
        return candidateBuffer
      }
    }

    const nextResizeState = shrinkResizeState(currentResizeState, metadata, options.resizeStepRatio)

    if (!nextResizeState) {
      break
    }

    currentResizeState = nextResizeState
  }

  return bestBuffer
}

function shrinkResizeState(
  resizeState: ResolvedResizeState | undefined,
  metadata: Metadata,
  ratio: number,
): ResolvedResizeState | undefined {
  const baseWidth = resizeState?.width ?? metadata.width
  const baseHeight = resizeState?.height ?? metadata.height

  if (typeof baseWidth !== 'number' && typeof baseHeight !== 'number') {
    return undefined
  }

  const nextWidth =
    typeof baseWidth === 'number' ? Math.max(Math.floor(baseWidth * ratio), 1) : undefined
  const nextHeight =
    typeof baseHeight === 'number' ? Math.max(Math.floor(baseHeight * ratio), 1) : undefined

  if (nextWidth === baseWidth && nextHeight === baseHeight) {
    return undefined
  }

  return {
    width: nextWidth,
    height: nextHeight,
    inferredFromMetadata: resizeState?.inferredFromMetadata ?? true,
  }
}
