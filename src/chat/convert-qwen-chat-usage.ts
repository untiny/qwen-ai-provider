import { LanguageModelV3Usage } from '@ai-sdk/provider'
import { QwenChatResponse } from './qwen-chat-api'

export function convertQwenChatUsage(usage: QwenChatResponse['usage'] | undefined | null): LanguageModelV3Usage {
  if (!usage) {
    return {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
      raw: undefined,
    }
  }

  const promptTokens = usage.prompt_tokens ?? 0
  const completionTokens = usage.completion_tokens ?? 0
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens - cachedTokens,
      cacheRead: cachedTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: undefined,
      reasoning: undefined,
    },
    raw: usage,
  }
}
