import type { ToolCall } from '@/types'

export interface ToolResultEvent {
  requestId: string
  toolUseId: string
  name: string
  result: unknown
}

export interface ToolCallArgsEvent {
  requestId: string
  toolUseId: string
  args: Record<string, unknown>
}

export interface RetryEvent {
  requestId: string
  attempt: number
  maxRetries: number
  delayMs: number
  status: number
  error: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onToolCall: (call: ToolCall) => void
  onToolResult: (event: ToolResultEvent) => void
  onToolCallArgs: (event: ToolCallArgsEvent) => void
  onThinking: (content: string, blockIndex: number) => void
  onUsage: (usage: { inputTokens: number; outputTokens: number }) => void
  onRetry?: (event: RetryEvent) => void
  onDone: () => void
  onError: (error: Error) => void
}

/**
 * 监听主进程回传的聊天流事件。
 * 返回清理函数用于移除监听。
 */
export function listenToChatStream(requestId: string, callbacks: StreamCallbacks): () => void {
  const unsubscribers: Array<() => void> = []

  unsubscribers.push(
    window.api.on('chat:chunk', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onToken(data.token)
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:tool-call', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onToolCall(data.toolCall)
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:tool-result', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onToolResult(data)
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:tool-call-args', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onToolCallArgs(data)
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:thinking', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onThinking(data.content, data.index)
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:done', (data: any) => {
      if (data.requestId === requestId) {
        // 如果 done 事件携带 usage，先回调
        if (data.usage) {
          callbacks.onUsage(data.usage)
        }
        callbacks.onDone()
        unsubscribers.forEach((fn) => fn())
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:error', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onError(new Error(data.error))
        unsubscribers.forEach((fn) => fn())
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:retry', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onRetry?.(data)
      }
    }),
  )

  unsubscribers.push(
    window.api.on('chat:usage', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onUsage({ inputTokens: data.inputTokens, outputTokens: data.outputTokens })
      }
    }),
  )

  return () => unsubscribers.forEach((fn) => fn())
}
