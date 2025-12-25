import { EmbeddingModelV3, ImageModelV3, LanguageModelV3, NoSuchModelError, ProviderV3 } from '@ai-sdk/provider'
import { FetchFunction, loadApiKey, VERSION, withoutTrailingSlash, withUserAgentSuffix } from '@ai-sdk/provider-utils'
import { QwenChatLanguageModel } from './chat/qwen-chat-language-model'
import { QwenChatModeId } from './chat/qwen-chat-options'
import { QwenCompletionLanguageModel } from './completion/qwen-completion-language-model'
import { QwenCompletionModelId } from './completion/qwen-completion-options'
import { QwenEmbeddingModel } from './embedding/qwen-embedding-model'
import { QwenEmbeddingModelId } from './embedding/qwen-embedding-options'

export interface QwenProvider extends ProviderV3 {
  (modelId: QwenChatModeId): LanguageModelV3

  /**
   * 创建文本生成模型。
   * @param modelId 用于文本生成的模型 ID。
   */
  languageModel(modelId: QwenChatModeId): LanguageModelV3

  /**
   * 创建文本生成模型。
   * @param modelId 用于文本生成的模型 ID。
   */
  chat(modelId: QwenChatModeId): LanguageModelV3

  completion(modelId: QwenCompletionModelId): LanguageModelV3

  /**
   * 创建文本嵌入模型。
   * @param modelId 用于文本嵌入的模型 ID。
   */
  embedding(modelId: QwenEmbeddingModelId): EmbeddingModelV3

  /**
   * 创建文本嵌入模型。
   * @param modelId 用于文本嵌入的模型 ID。
   */
  embeddingModel: (modelId: QwenEmbeddingModelId) => EmbeddingModelV3

  /**
   * @deprecated Use `embedding` instead.
   */
  textEmbedding(modelId: QwenEmbeddingModelId): EmbeddingModelV3

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: QwenEmbeddingModelId): EmbeddingModelV3

  imageModel(modelId: string): ImageModelV3
}

export interface QwenProviderSettings {
  /**
   * 对 API 调用使用不同的 URL 前缀，例如使用代理服务器。
   * 默认前缀是"https://dashscope.aliyuncs.com/compatible-mode/v1"。
   */
  baseURL?: string

  /**
   * 使用“Authorization”标头发送的 API 密钥。
   * 它默认为“DASHSCOPE_API_KEY”环境变量。
   */
  apiKey?: string

  /**
   * 要包含在请求中的自定义标头。
   */
  headers?: Record<string, string>

  /**
   * 自定义获取实现。您可以将其用作拦截请求的中间件，或者提供自定义的获取实现，例如测试。
   */
  fetch?: FetchFunction
}

/** 创建 Qwen AI 提供程序实例。 */
export function createQwen(options?: QwenProviderSettings): QwenProvider {
  const baseURL = withoutTrailingSlash(options?.baseURL) ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'

  const getHeaders = () => {
    const apiKey = loadApiKey({
      apiKey: options?.apiKey,
      environmentVariableName: 'DASHSCOPE_API_KEY',
      description: 'Qwen API key',
    })
    return withUserAgentSuffix(
      {
        Authorization: `Bearer ${apiKey}`,
        ...options?.headers,
      },
      `ai-sdk/qwen/${VERSION}`,
    )
  }

  const createChatModel = (modelId: QwenChatModeId) => {
    return new QwenChatLanguageModel(modelId, {
      provider: 'qwen.chat',
      baseURL,
      headers: getHeaders,
      fetch: options?.fetch,
      url: ({ path }) => `${baseURL}${path}`,
    })
  }

  const createCompletionModel = (modelId: QwenCompletionModelId) => {
    return new QwenCompletionLanguageModel(modelId, {
      provider: `qwen.completion`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options?.fetch,
    })
  }

  const createEmbeddingModel = (modelId: QwenEmbeddingModelId) => {
    return new QwenEmbeddingModel(modelId, {
      provider: `qwen.embedding`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options?.fetch,
    })
  }

  const provider = (modelId: QwenChatModeId) => {
    if (new.target) {
      throw new Error('The Qwen model function cannot be called with the new keyword.')
    }

    return createChatModel(modelId)
  }

  provider.specificationVersion = 'v3' as const
  provider.languageModel = createChatModel
  provider.chat = createChatModel
  provider.completion = createCompletionModel
  provider.embedding = createEmbeddingModel
  provider.embeddingModel = createEmbeddingModel
  provider.textEmbedding = createEmbeddingModel
  provider.textEmbeddingModel = createEmbeddingModel
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' })
  }

  return provider
}

export const qwen = createQwen()
