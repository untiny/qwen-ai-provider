import { LanguageModelV3CallOptions, SharedV3Warning, UnsupportedFunctionalityError } from '@ai-sdk/provider'
import { ChatTool, ChatToolChoice } from './qwen-chat-api'

export function prepareChatTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools']
  toolChoice?: LanguageModelV3CallOptions['toolChoice']
}): {
  tools?: ChatTool[]
  toolChoice?: ChatToolChoice
  toolWarnings: Array<SharedV3Warning>
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined

  const toolWarnings: SharedV3Warning[] = []

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings }
  }

  const chatTools: ChatTool[] = []

  for (const tool of tools) {
    if (tool.type === 'function') {
      chatTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description ?? '',
          parameters: tool.inputSchema,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      })
    } else {
      toolWarnings.push({
        type: 'unsupported',
        feature: `tool type: ${tool.type}`,
      })
    }
  }

  if (toolChoice == null) {
    return { tools: chatTools, toolChoice: undefined, toolWarnings }
  }

  const type = toolChoice.type

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: chatTools, toolChoice: type, toolWarnings }
    case 'tool':
      return {
        tools: chatTools,
        toolChoice: {
          type: 'function',
          function: {
            name: toolChoice.toolName,
          },
        },
        toolWarnings,
      }
    default: {
      const _exhaustiveCheck: never = type
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      })
    }
  }
}
