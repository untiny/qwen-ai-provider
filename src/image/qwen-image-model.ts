import {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { QwenConfig } from '@/qwe-config'
import { QwenImageRequest, QwenImageSize, qwenImageErrorSchema, qwenImageResponseSchema } from './qwen-image-api'
import { QwenImageModelId } from './qwen-image-options'

export class QwenImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3'

  readonly modelId: string

  private readonly config: QwenConfig

  constructor(modelId: QwenImageModelId, config: QwenConfig) {
    this.modelId = modelId
    this.config = config
  }

  get provider(): string {
    return this.config.provider
  }

  readonly maxImagesPerCall = 1

  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>
    warnings: Array<SharedV3Warning>
    providerMetadata?: ImageModelV3ProviderMetadata
    response: {
      timestamp: Date
      modelId: string
      headers: Record<string, string> | undefined
    }
    usage?: ImageModelV3Usage
  }> {
    const warnings: Array<SharedV3Warning> = []

    if (options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'This model does not support aspect ratio. Use `size` instead.',
      })
    }

    if (options.seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' })
    }

    const body: QwenImageRequest = {
      model: this.modelId,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: options.prompt ?? '' }],
          },
        ],
      },
      parameters: {
        size: options.size?.replace('x', '*') as QwenImageSize,
        n: options.n,
        watermark: false,
        seed: options.seed,
      },
    }

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/services/aigc/multimodal-generation/generation',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: qwenImageErrorSchema,
        errorToMessage: (data) => data.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(qwenImageResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const images: Array<Uint8Array> = []

    for (const choice of response.output.choices) {
      for (const content of choice.message.content) {
        if ('image' in content) {
          // 将URL图片转为Uint8Array
          const imageResponse = await fetch(content.image)
          const imageBuffer = await imageResponse.arrayBuffer()
          images.push(new Uint8Array(imageBuffer))
        }
      }
    }

    return {
      images: images,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    }
  }
}
