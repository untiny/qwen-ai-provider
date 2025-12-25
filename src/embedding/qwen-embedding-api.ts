import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils'
import { z } from 'zod'

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const qwenTextEmbeddingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(z.object({ embedding: z.array(z.number()) })),
      usage: z.object({ prompt_tokens: z.number() }).nullish(),
    }),
  ),
)

export type QwenTextEmbeddingResponse = InferSchema<typeof qwenTextEmbeddingResponseSchema>
