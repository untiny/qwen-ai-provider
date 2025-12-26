import {
  InvalidResponseDataError,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { QwenChatModeId } from '@/chat/qwen-chat-options'
import { getResponseMetadata } from '@/get-response-metadata'
import { mapQwenFinishReason } from '@/map-qwen-finish-reason'
import { QwenConfig } from '@/qwe-config'
import { qwenFailedResponseHandler } from '@/qwen-error'
import { convertQwenChatUsage } from './convert-qwen-chat-usage'
import { convertToQwenChatMessages } from './convert-to-qwen-chat-messages'
import {
  QwenChatChunk,
  QwenChatRequest,
  QwenChatResponse,
  qwenChatChunkSchema,
  qwenChatResponseSchema,
} from './qwen-chat-api'
import { prepareChatTools } from './qwen-chat-prepare-tools'

export class QwenChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'

  readonly modelId: QwenChatModeId

  readonly supportedUrls = {
    'image/*': [/^https?:\/\/.*$/],
  }

  private readonly config: QwenConfig

  constructor(modelId: QwenChatModeId, config: QwenConfig) {
    this.modelId = modelId
    this.config = config
  }

  get provider(): string {
    return this.config.provider
  }

  private async getArgs(options: LanguageModelV3CallOptions): Promise<{
    warnings: SharedV3Warning[]
    args: QwenChatRequest
  }> {
    const { messages, warnings } = convertToQwenChatMessages(options)

    const args: QwenChatRequest = {
      model: this.modelId,
      messages,
      max_tokens: options.maxOutputTokens,
      temperature: options.temperature,
      stop: options.stopSequences,
      top_p: options.topP,
      top_k: options.topK,
      presence_penalty: options.presencePenalty,
      frequency_penalty: options.frequencyPenalty,
      seed: options.seed,
    }

    if (options.responseFormat?.type === 'json') {
      if (options.responseFormat.schema != null) {
        args.response_format = {
          type: 'json_schema',
          json_schema: {
            schema: options.responseFormat.schema,
            name: options.responseFormat.name ?? 'response',
            description: options.responseFormat.description,
          },
        }
      } else {
        args.response_format = { type: 'json_object' }
      }
    }

    const { tools, toolChoice, toolWarnings } = prepareChatTools({
      tools: options.tools,
      toolChoice: options.toolChoice,
    })
    args.tools = tools
    args.tool_choice = toolChoice
    warnings.push(...toolWarnings)

    return { warnings, args }
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { warnings, args: body } = await this.getArgs(options)

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: qwenFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(qwenChatResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const choice = response.choices[0]
    const content: Array<LanguageModelV3Content> = []

    // reasoning content (before text):
    const reasoning = choice.message.reasoning_content
    if (reasoning != null && reasoning.length > 0) {
      content.push({
        type: 'reasoning',
        text: reasoning,
      })
    }

    // text content:
    const text = choice.message.content
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text })
    }

    // tool calls:
    for (const toolCall of choice.message.tool_calls ?? []) {
      content.push({
        type: 'tool-call' as const,
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.function.name,
        input: toolCall.function.arguments,
      })
    }

    return {
      content,
      finishReason: {
        unified: mapQwenFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertQwenChatUsage(response.usage),
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      providerMetadata: {
        qwen: {},
      },
    }
  }
  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { warnings, args } = await this.getArgs(options)

    const body: QwenChatRequest = {
      ...args,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: qwenFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(qwenChatChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const toolCalls: Array<{
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }
      hasFinished: boolean
    }> = []

    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    }
    let usage: QwenChatResponse['usage'] | undefined
    let isFirstChunk = true
    let isActiveReasoning = false
    let isActiveText = false
    let textId: string | undefined
    let reasoningId: string | undefined

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<QwenChatChunk>, LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings })
          },

          transform(chunk, controller) {
            // Emit raw chunk if requested (before anything else)
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
            if ('error' in value) {
              finishReason = { unified: 'error', raw: undefined }
              controller.enqueue({
                type: 'error',
                error: value.error.message,
              })
              return
            }

            if (isFirstChunk) {
              isFirstChunk = false

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              })
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

            if (choice?.delta == null) {
              return
            }

            const delta = choice.delta

            // enqueue reasoning before text deltas:
            const reasoningContent = delta.reasoning_content
            if (reasoningContent) {
              if (!isActiveReasoning) {
                reasoningId = generateId()
                controller.enqueue({
                  type: 'reasoning-start',
                  id: reasoningId as string,
                })
                isActiveReasoning = true
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: reasoningId as string,
                delta: reasoningContent,
              })
            }

            if (delta.content) {
              if (!isActiveText) {
                textId = generateId()
                controller.enqueue({ type: 'text-start', id: textId as string })
                isActiveText = true
              }

              // end reasoning when text starts:
              if (isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: reasoningId as string,
                })
                isActiveReasoning = false
              }

              controller.enqueue({
                type: 'text-delta',
                id: textId as string,
                delta: delta.content,
              })
            }

            if (delta.tool_calls != null) {
              // end reasoning when tool calls start:
              if (isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: reasoningId as string,
                })
                isActiveReasoning = false
              }

              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index

                if (toolCalls[index] == null) {
                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`,
                    })
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`,
                    })
                  }

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: toolCallDelta.id,
                    toolName: toolCallDelta.function.name,
                  })

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                    hasFinished: false,
                  }

                  const toolCall = toolCalls[index]

                  if (toolCall.function?.name != null && toolCall.function?.arguments != null) {
                    // send delta if the argument text has already started:
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-input-delta',
                        id: toolCall.id,
                        delta: toolCall.function.arguments,
                      })
                    }

                    // check if tool call is complete
                    // (some providers send the full tool call in one chunk):
                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-input-end',
                        id: toolCall.id,
                      })

                      controller.enqueue({
                        type: 'tool-call',
                        toolCallId: toolCall.id ?? generateId(),
                        toolName: toolCall.function.name,
                        input: toolCall.function.arguments,
                      })
                      toolCall.hasFinished = true
                    }
                  }

                  continue
                }

                // existing tool call, merge if not finished
                const toolCall = toolCalls[index]

                if (toolCall.hasFinished) {
                  continue
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function.arguments += toolCallDelta.function?.arguments ?? ''
                }

                // send delta
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? '',
                })

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-input-end',
                    id: toolCall.id,
                  })

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments,
                  })
                  toolCall.hasFinished = true
                }
              }
            }
          },

          flush(controller) {
            if (isActiveReasoning) {
              controller.enqueue({ type: 'reasoning-end', id: reasoningId as string })
            }

            if (isActiveText) {
              controller.enqueue({ type: 'text-end', id: textId as string })
            }

            // go through all tool calls and send the ones that are not finished
            for (const toolCall of toolCalls.filter((toolCall) => !toolCall.hasFinished)) {
              controller.enqueue({
                type: 'tool-input-end',
                id: toolCall.id,
              })

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id ?? generateId(),
                toolName: toolCall.function.name,
                input: toolCall.function.arguments,
              })
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertQwenChatUsage(usage),
              providerMetadata: {
                qwen: {},
              },
            })
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    }
  }
}
