import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { getResponseMetadata } from '@/get-response-metadata'
import { mapQwenFinishReason } from '@/map-qwen-finish-reason'
import { qwenFailedResponseHandler } from '../qwen-error'
import { convertQwenCompletionUsage } from './convert-qwen-completion-usage'
import { convertToQwenCompletionPrompt } from './convert-to-qwen-completion-prompt'
import {
  QwenCompletionChunk,
  QwenCompletionRequest,
  QwenCompletionResponse,
  qwenCompletionChunkSchema,
  qwenCompletionResponseSchema,
} from './qwen-completion-api'
import { QwenCompletionModelId } from './qwen-completion-options'

type QwenCompletionConfig = {
  provider: string
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: FetchFunction
}

export class QwenCompletionLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'

  readonly modelId: QwenCompletionModelId

  private readonly config: QwenCompletionConfig

  constructor(modelId: QwenCompletionModelId, config: QwenCompletionConfig) {
    this.modelId = modelId
    this.config = config
  }

  get provider(): string {
    return this.config.provider
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    // No URLs are supported for completion models.
  }

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    presencePenalty,
    stopSequences: userStopSequences,
    responseFormat,
    tools,
    toolChoice,
    seed,
  }: LanguageModelV3CallOptions) {
    const warnings: SharedV3Warning[] = []

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' })
    }

    if (tools?.length) {
      warnings.push({ type: 'unsupported', feature: 'tools' })
    }

    if (toolChoice != null) {
      warnings.push({ type: 'unsupported', feature: 'toolChoice' })
    }

    if (responseFormat != null && responseFormat.type !== 'text') {
      warnings.push({
        type: 'unsupported',
        feature: 'responseFormat',
        details: 'JSON response format is not supported.',
      })
    }

    const { prompt: completionPrompt, stopSequences } = convertToQwenCompletionPrompt({ prompt })

    const stop = [...(stopSequences ?? []), ...(userStopSequences ?? [])]

    const args: QwenCompletionRequest = {
      // model id:
      model: this.modelId,

      // standardized settings:
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      presence_penalty: presencePenalty,
      seed,

      // prompt:
      prompt: completionPrompt,

      // stop sequences:
      stop: stop.length > 0 ? stop : undefined,
    }

    return { args, warnings }
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings } = await this.getArgs(options)

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: qwenFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(qwenCompletionResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const choice = response.choices[0]

    const providerMetadata: SharedV3ProviderMetadata = { qwen: {} }

    return {
      content: [{ type: 'text', text: choice.text }],
      usage: convertQwenCompletionUsage(response.usage),
      finishReason: {
        unified: mapQwenFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      request: { body: args },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata,
      warnings,
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = await this.getArgs(options)

    const body = {
      ...args,
      stream: true,

      stream_options: {
        include_usage: true,
      },
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: qwenFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(qwenCompletionChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    }
    const providerMetadata: SharedV3ProviderMetadata = { qwen: {} }
    let usage: QwenCompletionResponse['usage'] | undefined
    let isFirstChunk = true

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<QwenCompletionChunk>, LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings })
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue })
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined }
              controller.enqueue({ type: 'error', error: chunk.error })
              return
            }

            const value = chunk.value

            // handle error chunks:
            if ('object' in value) {
              finishReason = { unified: 'error', raw: undefined }
              controller.enqueue({ type: 'error', error: value.message })
              return
            }

            if (isFirstChunk) {
              isFirstChunk = false

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              })

              controller.enqueue({ type: 'text-start', id: '0' })
            }

            if (value.usage != null) {
              usage = value.usage
            }

            const choice = value.choices[0]

            if (choice?.finish_reason != null) {
              finishReason = {
                unified: mapQwenFinishReason(choice.finish_reason),
                raw: choice.finish_reason,
              }
            }

            if (choice?.text != null && choice.text.length > 0) {
              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: choice.text,
              })
            }
          },

          flush(controller) {
            if (!isFirstChunk) {
              controller.enqueue({ type: 'text-end', id: '0' })
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              providerMetadata,
              usage: convertQwenCompletionUsage(usage),
            })
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    }
  }
}
