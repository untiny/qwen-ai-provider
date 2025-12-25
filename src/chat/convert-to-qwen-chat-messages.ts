import {
  LanguageModelV3CallOptions,
  LanguageModelV3FilePart,
  LanguageModelV3ReasoningPart,
  LanguageModelV3TextPart,
  LanguageModelV3ToolApprovalResponsePart,
  LanguageModelV3ToolCallPart,
  LanguageModelV3ToolResultPart,
  SharedV3Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'
import { convertToBase64 } from '@ai-sdk/provider-utils'
import {
  ChatAssistantMessage,
  ChatContent,
  ChatMessage,
  ChatSystemMessage,
  ChatToolMessage,
  ChatUserMessage,
} from './qwen-chat-api'

function contentToAssistantMessage(
  content: Array<
    | LanguageModelV3TextPart
    | LanguageModelV3FilePart
    | LanguageModelV3ReasoningPart
    | LanguageModelV3ToolCallPart
    | LanguageModelV3ToolResultPart
  >,
): ChatAssistantMessage {
  const message: ChatAssistantMessage = {
    role: 'assistant',
    content: '',
  }

  for (const part of content) {
    switch (part.type) {
      case 'text': {
        message.content += part.text
        break
      }
      case 'tool-call': {
        message.tool_calls ??= []
        message.tool_calls.push({
          id: part.toolCallId,
          type: 'function',
          function: {
            name: part.toolName,
            arguments: JSON.stringify(part.input),
          },
          index: message.tool_calls.length,
        })
        break
      }
    }
  }
  return message
}

function contentToSystemMessage(content: string): ChatSystemMessage {
  return { role: 'system', content }
}

function contentToToolMessage(
  content: Array<LanguageModelV3ToolResultPart | LanguageModelV3ToolApprovalResponsePart>,
): ChatToolMessage[] {
  const messages: ChatToolMessage[] = []
  for (const toolResponse of content) {
    if (toolResponse.type === 'tool-approval-response') {
      continue
    }
    const output = toolResponse.output
    let contentValue: string
    switch (output.type) {
      case 'text':
      case 'error-text':
        contentValue = output.value
        break
      case 'execution-denied':
        contentValue = output.reason ?? 'Tool execution denied.'
        break
      case 'content':
      case 'json':
      case 'error-json':
        contentValue = JSON.stringify(output.value)
        break
    }

    messages.push({
      role: 'tool',
      tool_call_id: toolResponse.toolCallId,
      content: contentValue,
    })
  }
  return messages
}

function contentToUserMessage(content: Array<LanguageModelV3TextPart | LanguageModelV3FilePart>): ChatUserMessage {
  if (content.length === 1 && content[0].type === 'text') {
    return {
      role: 'user',
      content: content[0].text,
    }
  }

  const contents: ChatContent = []
  for (const part of content) {
    if (part.type === 'text') {
      contents.push({ type: 'text', text: part.text })
    } else if (part.mediaType.startsWith('image/')) {
      const data: string = part.data instanceof URL ? part.data.toString() : convertToBase64(part.data)
      const url = data.startsWith('http') || data.startsWith('data:') ? data : `data:${part.mediaType};base64,${data}`
      contents.push({
        type: 'image_url',
        image_url: { url },
      })
    } else if (part.mediaType.startsWith('audio/')) {
      const data: string = part.data instanceof URL ? part.data.toString() : convertToBase64(part.data)
      const url = data.startsWith('http') || data.startsWith('data:') ? data : `data:${part.mediaType};base64,${data}`
      switch (part.mediaType) {
        case 'audio/wav': {
          contents.push({
            type: 'input_audio',
            input_audio: {
              data: url,
              format: 'wav',
            },
          })
          break
        }
        case 'audio/mp3':
        case 'audio/mpeg': {
          contents.push({
            type: 'input_audio',
            input_audio: {
              data: url,
              format: 'mp3',
            },
          })
          break
        }

        default: {
          throw new UnsupportedFunctionalityError({
            functionality: `audio content parts with media type ${part.mediaType}`,
          })
        }
      }
    } else {
      throw new UnsupportedFunctionalityError({
        functionality: `file part media type ${part.mediaType}`,
      })
    }
  }
  return {
    role: 'user',
    content: contents,
  }
}

export function convertToQwenChatMessages<T extends Pick<LanguageModelV3CallOptions, 'prompt'>>(
  options: T,
): {
  messages: ChatMessage[]
  warnings: SharedV3Warning[]
} {
  const messages: ChatMessage[] = []
  const warnings: SharedV3Warning[] = []

  for (const { role, content } of options.prompt) {
    switch (role) {
      case 'system': {
        messages.push(contentToSystemMessage(content))
        break
      }
      case 'user': {
        messages.push(contentToUserMessage(content))
        break
      }
      case 'assistant': {
        messages.push(contentToAssistantMessage(content))
        break
      }
      case 'tool': {
        messages.push(...contentToToolMessage(content))
        break
      }
      default: {
        const _exhaustiveCheck: never = role
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`)
      }
    }
  }

  return { messages, warnings }
}
