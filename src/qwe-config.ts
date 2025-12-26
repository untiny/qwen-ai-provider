import { FetchFunction } from '@ai-sdk/provider-utils'

export interface QwenConfig {
  provider: string
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: FetchFunction
}
