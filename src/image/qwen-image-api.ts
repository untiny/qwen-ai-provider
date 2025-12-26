import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils'
import z from 'zod'
import { QwenImageModelId } from './qwen-image-options'

export type QwenImageSize =
  | '1664*928'
  | '1472*1140'
  | '1328*1328'
  | '1140*1472'
  | '928*1664'
  | (`${number}*${number}` & {})

export interface QwenImageRequest {
  model: QwenImageModelId
  input: {
    messages: {
      role: 'user'
      content: ({ text: string } | { image: string })[]
    }[]
  }
  parameters?: {
    /** 反向提示词，用于描述不希望在图像中出现的内容，对画面进行限制 */
    negative_prompt?: string | undefined
    size?: QwenImageSize | undefined
    enable_interleave?: boolean | undefined
    /** 图像生成数量，默认值为1 */
    n?: number | undefined
    max_images?: number | undefined
    prompt_extend?: boolean | undefined
    stream?: boolean | undefined
    watermark?: boolean | undefined
    seed?: number | undefined
  }
}

export const qwenImageErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export const qwenImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      output: z.object({
        choices: z.array(
          z.object({
            finish_reason: z.string(),
            message: z.object({
              role: z.literal('assistant'),
              content: z.array(
                z.object({
                  image: z.string(),
                }),
              ),
            }),
          }),
        ),
        task_metric: z
          .object({
            TOTAL: z.number(),
            SUCCEEDED: z.number(),
            FAILED: z.number(),
          })
          .nullish(),
        finished: z.boolean().nullish(),
      }),
      usage: z.object({
        image_count: z.number().nullish(),
        size: z.string().nullish(),
        width: z.number().nullish(),
        height: z.number().nullish(),
      }),
    }),
  ),
)

export type QwenImageResponse = InferSchema<typeof qwenImageResponseSchema>
