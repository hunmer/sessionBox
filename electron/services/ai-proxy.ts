import { BrowserWindow } from 'electron'
import { getAIProvider } from './store'

interface ProxyRequest {
  _requestId: string
  providerId: string
  modelId: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
}

/**
 * 将渲染进程的聊天请求代理到 LLM 供应商 API。
 * API Key 仅在主进程内存中组装，不暴露给渲染进程。
 */
export async function proxyChatCompletions(
  mainWindow: BrowserWindow,
  params: ProxyRequest,
): Promise<void> {
  const { _requestId, providerId, modelId, messages, tools, stream, maxTokens, thinking } = params
  const send = (channel: string, data: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  try {
    const provider = getAIProvider(providerId)
    if (!provider) {
      send('on:chat:error', { requestId: _requestId, error: `Provider not found: ${providerId}` })
      return
    }
    if (!provider.apiKey) {
      send('on:chat:error', { requestId: _requestId, error: `Provider has no API key: ${providerId}` })
      return
    }

    // 构造 Anthropic API 请求
    const apiUrl = `${provider.apiBase.replace(/\/$/, '')}/v1/messages`

    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      max_tokens: maxTokens ?? 4096,
      stream: true,
    }
    if (tools && tools.length > 0) {
      body.tools = tools
    }
    if (thinking) {
      body.thinking = thinking
      if (!maxTokens || maxTokens < (thinking.budgetTokens + 1024)) {
        body.max_tokens = (thinking.budgetTokens + 4096)
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      send('on:chat:error', { requestId: _requestId, error: `API error ${response.status}: ${errorText}` })
      return
    }

    if (!response.body) {
      send('on:chat:error', { requestId: _requestId, error: 'No response body' })
      return
    }

    // 解析 SSE 流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            send('on:chat:done', { requestId: _requestId })
            return
          }
          try {
            const event = JSON.parse(data)
            forwardSSEEvent(send, _requestId, event)
          } catch {
            // 非JSON行，忽略
          }
        }
      }
    }

    send('on:chat:done', { requestId: _requestId })
  } catch (error) {
    send('on:chat:error', {
      requestId: _requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 根据 Anthropic SSE event type 转发到对应的 IPC 通道
 */
function forwardSSEEvent(
  send: (channel: string, data: unknown) => void,
  requestId: string,
  event: Record<string, unknown>,
): void {
  const type = event.type as string

  switch (type) {
    case 'content_block_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta') {
        send('on:chat:chunk', { requestId, token: delta.text })
      } else if (delta?.type === 'thinking_delta') {
        send('on:chat:thinking', { requestId, content: delta.thinking })
      }
      break
    }
    case 'content_block_start': {
      const contentBlock = event.content_block as Record<string, unknown> | undefined
      if (contentBlock?.type === 'tool_use') {
        send('on:chat:tool-call', {
          requestId,
          toolCall: {
            id: contentBlock.id,
            name: contentBlock.name,
            args: {},
            status: 'running',
            startedAt: Date.now(),
          },
        })
      }
      break
    }
    case 'content_block_stop': {
      const index = event.index as number
      send('on:chat:tool-call-update', { requestId, index, status: 'completed', completedAt: Date.now() })
      break
    }
    case 'input_json_delta': {
      const delta = event.delta as string | undefined
      if (delta) {
        send('on:chat:tool-call-args-delta', { requestId, index: event.index, delta })
      }
      break
    }
    case 'message_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.stop_reason) {
        send('on:chat:stop-reason', { requestId, stopReason: delta.stop_reason })
      }
      break
    }
    case 'error': {
      send('on:chat:error', { requestId, error: event.error })
      break
    }
  }
}

/**
 * 测试供应商连接是否正常
 */
export async function testProviderConnection(providerId: string): Promise<{ success: boolean; error?: string }> {
  const provider = getAIProvider(providerId)
  if (!provider) {
    return { success: false, error: `Provider not found: ${providerId}` }
  }

  try {
    const apiUrl = `${provider.apiBase.replace(/\/$/, '')}/v1/messages`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.models[0]?.id ?? 'claude-sonnet-4-6-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
        stream: false,
      }),
    })

    if (response.ok) {
      return { success: true }
    }
    const errorText = await response.text()
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
