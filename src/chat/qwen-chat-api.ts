import { JSONSchema7 } from '@ai-sdk/provider'
import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils'
import z from 'zod'
import { qwenErrorDataSchema } from '@/qwen-error'

export interface ChatTextContent {
  type: 'text'
  text: string
}

export interface ChatImageUrlContent {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export interface ChatInputAudioContent {
  type: 'input_audio'
  input_audio: {
    data: string
    format: 'mp3' | 'wav' | (string & {})
  }
}

export type ChatContent = string | Array<ChatTextContent | ChatImageUrlContent | ChatInputAudioContent> | null

export interface ChatSystemMessage {
  role: 'system'
  content: string
}

export interface ChatUserMessage {
  role: 'user'
  content: ChatContent
}

export interface ChatAssistantMessage {
  role: 'assistant'
  content?: string | null | undefined
  partial?: boolean
  tool_calls?: Array<ChatAssistantToolCall>
}

export interface ChatAssistantToolCall {
  id: string
  type: 'function'
  index: number
  function: {
    name: string
    arguments: string
  }
}

export interface ChatToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
}

export type ChatMessage = ChatSystemMessage | ChatUserMessage | ChatAssistantMessage | ChatToolMessage

export type ChatToolChoice = 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } }

export interface ChatToolFunction {
  /** 工具名称 */
  name: string
  /** 工具描述信息，帮助模型判断何时以及如何调用该工具 */
  description: string
  /** 工具的参数描述，需要是一个合法的JSON Schema */
  parameters: JSONSchema7
  /** 是否开启严格模式，开启后模型将严格按照参数描述调用工具，不允许返回不符合参数描述的结果 */
  strict?: boolean
}

export interface ChatTool {
  type: 'function'
  function: ChatToolFunction
}

export interface ChatStreamOptions {
  /** 是否在响应的最后一个数据块包含Token消耗信息 */
  include_usage: boolean
}

export interface ChatResponseTextFormat {
  /** 响应文本格式 */
  type: 'text'
}

export interface ChatResponseJsonObjectFormat {
  /** 响应JSON对象格式 */
  type: 'json_object'
}

export interface ChatResponseJsonSchemaFormat {
  /** 响应JSON Schema格式 */
  type: 'json_schema'
  json_schema: {
    name?: string
    description?: string
    schema?: JSONSchema7
  }
}

export type ChatResponseFormat = ChatResponseTextFormat | ChatResponseJsonObjectFormat | ChatResponseJsonSchemaFormat

export interface QwenChatRequest {
  model: string
  messages: Array<ChatMessage>
  /** 是否以流式输出方式回复 */
  stream?: boolean | undefined
  /** 流式输出的配置项 */
  stream_options?: ChatStreamOptions | undefined
  /** 最大输出 */
  max_tokens?: number | undefined
  temperature?: number | undefined
  stop?: Array<string> | undefined
  top_p?: number | undefined
  top_k?: number | undefined
  presence_penalty?: number | undefined
  frequency_penalty?: number | undefined
  response_format?: ChatResponseFormat | undefined
  seed?: number | undefined
  tools?: Array<ChatTool> | undefined
  tool_choice?: ChatToolChoice | undefined
}

export const qwenChatUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish()

export const qwenChatResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      choices: z.array(
        z.object({
          finish_reason: z.string().nullish(),
          index: z.number(),
          message: z.object({
            role: z.literal('assistant').nullish(),
            content: z.string().nullish(),
            reasoning_content: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  id: z.string().nullish(),
                  type: z.literal('function'),
                  function: z.object({
                    name: z.string(),
                    arguments: z.string(),
                  }),
                }),
              )
              .nullish(),
          }),
        }),
      ),
      usage: qwenChatUsageSchema,
    }),
  ),
)
export type QwenChatResponse = InferSchema<typeof qwenChatResponseSchema>

export const qwenChatChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        id: z.string().nullish(),
        created: z.number().nullish(),
        model: z.string().nullish(),
        choices: z.array(
          z.object({
            delta: z.object({
              role: z.enum(['assistant']).nullish(),
              content: z.string().nullish(),
              reasoning_content: z.string().nullish(),
              tool_calls: z
                .array(
                  z.object({
                    index: z.number(),
                    id: z.string().nullish(),
                    type: z.literal('function').nullish(),
                    function: z.object({
                      name: z.string().nullish(),
                      arguments: z.string().nullish(),
                    }),
                  }),
                )
                .nullish(),
            }),
            finish_reason: z.string().nullish(),
            index: z.number(),
          }),
        ),
        usage: qwenChatUsageSchema,
      }),
      qwenErrorDataSchema,
    ]),
  ),
)
export type QwenChatChunk = InferSchema<typeof qwenChatChunkSchema>
