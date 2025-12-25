import { EmbeddingModelV3, TooManyEmbeddingValuesForCallError } from '@ai-sdk/provider'
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { qwenFailedResponseHandler } from '../qwen-error'
import { qwenTextEmbeddingResponseSchema } from './qwen-embedding-api'
import { QwenEmbeddingModelId, qwenEmbeddingProviderOptions } from './qwen-embedding-options'

interface QwenEmbeddingConfig {
  provider: string
  url: (options: { modelId: string; path: string }) => string
  headers: () => Record<string, string | undefined>
  fetch?: FetchFunction
}

export class QwenEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3'
  readonly modelId: QwenEmbeddingModelId
  readonly maxEmbeddingsPerCall = 2048
  readonly supportsParallelCalls = true

  private readonly config: QwenEmbeddingConfig

  get provider(): string {
    return this.config.provider
  }

  constructor(modelId: QwenEmbeddingModelId, config: QwenEmbeddingConfig) {
    this.modelId = modelId
    this.config = config
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV3['doEmbed']>[0]): Promise<Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>> {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      })
    }

    // Parse provider options
    const qwenOptions =
      (await parseProviderOptions({
        provider: 'qwen',
        providerOptions,
        schema: qwenEmbeddingProviderOptions,
      })) ?? {}

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/embeddings',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        encoding_format: 'float',
        dimensions: qwenOptions.dimensions,
      },
      failedResponseHandler: qwenFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(qwenTextEmbeddingResponseSchema),
      abortSignal,
      fetch: this.config.fetch,
    })

    return {
      warnings: [],
      embeddings: response.data.map((item) => item.embedding),
      usage: response.usage ? { tokens: response.usage.prompt_tokens } : undefined,
      response: { headers: responseHeaders, body: rawValue },
    }
  }
}
