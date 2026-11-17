import { ipcRenderer } from 'electron'
import type { ChatCompletionParams } from './types'

export function createChatApi() {
  return {
    completions: (params: ChatCompletionParams & { _requestId: string }): Promise<{ started: boolean }> =>
      ipcRenderer.invoke('chat:completions', params),
    abort: (requestId: string): Promise<{ aborted: boolean }> =>
      ipcRenderer.invoke('chat:abort', requestId),
    appendMessageLog: (
      sessionId: string,
      entry: { role: string; content: string; modelId?: string; createdAt: number }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('chat:appendMessageLog', sessionId, entry),
    openMessageLogLocation: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('chat:openMessageLogLocation', sessionId),
  }
}
