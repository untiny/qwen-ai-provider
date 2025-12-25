import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils'
import z from 'zod'

export type QwenEmbeddingModelId = 'text-embedding-v4' | (string & {})

export const qwenEmbeddingProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
The number of dimensions the resulting output embeddings should have.
Only supported in text-embedding-3 and later models.
   */
      dimensions: z.number().optional(),
    }),
  ),
)

export type QwenEmbeddingProviderOptions = InferSchema<typeof qwenEmbeddingProviderOptions>
