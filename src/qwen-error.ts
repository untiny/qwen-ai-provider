import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils'
import z from 'zod'

export const qwenErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    param: z.string().nullish(),
    code: z.string().nullish(),
  }),
})

export type QwenErrorData = z.infer<typeof qwenErrorDataSchema>

export const qwenFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: qwenErrorDataSchema,
  errorToMessage: (data) => data.error.message,
})
