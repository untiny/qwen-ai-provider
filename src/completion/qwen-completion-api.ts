import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils'
import { z } from 'zod'
import { ChatStreamOptions } from '@/chat/qwen-chat-api'
import { qwenErrorDataSchema } from '../qwen-error'

export interface QwenCompletionRequest {
  model: string
  prompt: string
  /** 是否以流式输出方式回复 */
  stream?: boolean | undefined
  /** 流式输出的配置项 */
  stream_options?: ChatStreamOptions | undefined
  /** 最大输出 */
  max_tokens?: number | undefined
  temperature?: number | undefined
  stop?: Array<string> | undefined
  top_p?: number | undefined
  presence_penalty?: number | undefined
  seed?: number | undefined
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const qwenCompletionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      choices: z.array(
        z.object({
          text: z.string(),
          finish_reason: z.string().nullish(),
        }),
      ),
      usage: z
        .object({
          prompt_tokens: z.number(),
          completion_tokens: z.number(),
          total_tokens: z.number(),
        })
        .nullish(),
    }),
  ),
)

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const qwenCompletionChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        id: z.string().nullish(),
        created: z.number().nullish(),
        model: z.string().nullish(),
        choices: z.array(
          z.object({
            text: z.string(),
            finish_reason: z.string().nullish(),
            index: z.number(),
          }),
        ),
        usage: z
          .object({
            prompt_tokens: z.number(),
            completion_tokens: z.number(),
            total_tokens: z.number(),
          })
          .nullish(),
      }),
      qwenErrorDataSchema,
    ]),
  ),
)

export type QwenCompletionChunk = InferSchema<typeof qwenCompletionChunkSchema>

export type QwenCompletionResponse = InferSchema<typeof qwenCompletionResponseSchema>
