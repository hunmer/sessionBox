import { BrowserWindow } from 'electron'
import { getAIProvider, listTabs, listGroups, listPages, listWorkspaces, getPageById, getGroupById } from './store'
import { webviewManager } from './webview-manager'
import {
  buildCategoryListResponse,
  buildToolDetailResponse,
  buildToolListResponse,
  isBrowserBusinessToolName,
} from '../../src/lib/agent/tools'
import { dispatchWorkflowTool, rejectPendingRendererToolsForRequest } from './workflow-tool-dispatcher'
import {
  executeCreateTab, executeWindowTool, executeBrowserTool,
  executePageTool, executeSkillTool, executeInjectJs, cssEscape,
} from './ai-proxy-tools'

interface ProxyRequest {
  _requestId: string
  providerId: string
  modelId: string
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
  enabledToolNames?: string[]
  _mode?: string
  _workflowId?: string
}

/** 可重试的 HTTP 状态码（服务过载、限流、临时故障） */
const RETRYABLE_STATUS_CODES = new Set([429, 529, 500, 502, 503, 504])
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 2000

/** 活跃请求的 AbortController 映射，供外部中止 */
export const activeRequests = new Map<string, AbortController>()

function isRetryableError(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface ImageToolContent {
  mediaType: string
  data: string
  width: number
  height: number
}

function getImageToolContent(result: unknown): ImageToolContent | null {
  if (!isRecord(result)) return null
  if ('_isImageContent' in result) return result as unknown as ImageToolContent
  const data = result.data
  if (!isRecord(data)) return null
  const nestedResult = data.result
  if (isRecord(nestedResult) && '_isImageContent' in nestedResult) {
    return nestedResult as unknown as ImageToolContent
  }
  return null
}

/**
 * 将渲染进程的聊天请求代理到 LLM 供应商 API。
 * API Key 仅在主进程内存中组装，不暴露给渲染进程。
 * 支持 tool_use 多轮循环：LLM 请求调用工具 → 主进程执行 → 结果回传 → 继续对话。
 */
export async function proxyChatCompletions(
  mainWindow: BrowserWindow,
  params: ProxyRequest,
): Promise<void> {
  const { _requestId, providerId, modelId, system, messages, tools, stream, maxTokens, thinking, targetTabId, enabledToolNames, _mode, _workflowId } = params

  const abortController = new AbortController()
  activeRequests.set(_requestId, abortController)

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

    const apiUrl = `${provider.apiBase.replace(/\/$/, '')}/v1/messages`
    const MAX_TOOL_ROUNDS = 100
    const currentMessages = [...messages]
    const cumulativeUsage = { inputTokens: 0, outputTokens: 0 }
    let contentBlockOffset = 0

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[ai-proxy] round ${round + 1}, messages count: ${currentMessages.length}`)

      const body: Record<string, unknown> = {
        model: modelId, messages: currentMessages, max_tokens: maxTokens ?? 4096, stream: true,
      }
      if (system) body.system = system
      if (tools && tools.length > 0) body.tools = tools
      if (thinking) {
        body.thinking = thinking
        if (!maxTokens || maxTokens < (thinking.budgetTokens + 1024)) body.max_tokens = (thinking.budgetTokens + 4096)
      }

      let response: Response | null = null
      let lastErrorText = ''

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
          signal: abortController.signal,
        })
        if (response.ok) break
        lastErrorText = await response.text()
        if (attempt < MAX_RETRIES && isRetryableError(response.status)) {
          const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          console.warn(`[ai-proxy] API error ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${retryDelay}ms...`)
          send('on:chat:retry', { requestId: _requestId, attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs: retryDelay, status: response.status, error: lastErrorText })
          await delay(retryDelay)
          continue
        }
        send('on:chat:error', { requestId: _requestId, error: `API error ${response.status}: ${lastErrorText}` })
        return
      }

      if (!response || !response.body) {
        send('on:chat:error', { requestId: _requestId, error: 'No response body' })
        return
      }

      const parsed = await parseSSEStream(response.body, send, _requestId, cumulativeUsage, contentBlockOffset)
      console.log(`[ai-proxy] round ${round + 1} done, stop_reason: ${parsed.stopReason}, tool_calls: ${parsed.toolCalls.length}`)
      contentBlockOffset += parsed.blockCount

      if (parsed.stopReason !== 'tool_use' || parsed.toolCalls.length === 0) {
        send('on:chat:done', { requestId: _requestId, usage: cumulativeUsage })
        return
      }

      // === 工具执行阶段 ===
      console.log(`[ai-proxy] executing ${parsed.toolCalls.length} tool call(s)...`)
      const assistantContent: Array<Record<string, unknown>> = []
      if (parsed.textContent) assistantContent.push({ type: 'text', text: parsed.textContent })
      for (const tc of parsed.toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
      }

      const toolResults: Array<Record<string, unknown>> = []
      for (const tc of parsed.toolCalls) {
        console.log(`[ai-proxy] executing tool: ${tc.name}, args: ${JSON.stringify(tc.args)}`)
        let result: any
        if (_mode === 'workflow' && _workflowId) {
          result = await dispatchWorkflowTool(mainWindow, _requestId, tc.id, tc.name, tc.args, _workflowId)
        } else {
          result = await executeTool(tc.name, tc.args, targetTabId, enabledToolNames)
        }

        let toolResultContent: string | Array<Record<string, unknown>>
        const img = getImageToolContent(result)
        if (img) {
          toolResultContent = [
            { type: 'text', text: `Screenshot captured (${img.width}x${img.height})` },
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
          ]
          console.log(`[ai-proxy] tool ${tc.name} result: screenshot ${img.width}x${img.height}`)
        } else {
          toolResultContent = typeof result === 'string' ? result : JSON.stringify(result)
          console.log(`[ai-proxy] tool ${tc.name} result: ${(toolResultContent as string).slice(0, 200)}`)
        }

        const safeResult = typeof result === 'string' ? result : JSON.parse(JSON.stringify(result))
        send('on:chat:tool-result', { requestId: _requestId, toolUseId: tc.id, name: tc.name, result: safeResult })
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: toolResultContent })
      }

      currentMessages.push({ role: 'assistant', content: assistantContent })
      currentMessages.push({ role: 'user', content: toolResults })
    }

    console.warn(`[ai-proxy] reached max tool rounds (${MAX_TOOL_ROUNDS}), stopping`)
    send('on:chat:done', { requestId: _requestId })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log(`[ai-proxy] request ${_requestId} aborted by user`)
      return
    }
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[ai-proxy] request ${_requestId} aborted by user`)
      return
    }
    send('on:chat:error', { requestId: _requestId, error: error instanceof Error ? error.message : String(error) })
  } finally {
    rejectPendingRendererToolsForRequest(_requestId, new Error('聊天请求已结束，渲染进程工具等待已取消'))
    activeRequests.delete(_requestId)
  }
}

/** 根据 Anthropic SSE event type 转发到对应的 IPC 通道 */
function forwardSSEEvent(
  send: (channel: string, data: unknown) => void,
  requestId: string,
  event: Record<string, unknown>,
  indexOffset = 0,
): void {
  const type = event.type as string
  switch (type) {
    case 'content_block_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta') {
        send('on:chat:chunk', { requestId, token: delta.text })
      } else if (delta?.type === 'thinking_delta') {
        send('on:chat:thinking', { requestId, content: delta.thinking, index: (event.index as number) + indexOffset })
      } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        send('on:chat:tool-call-args-delta', { requestId, index: event.index, delta: delta.partial_json })
      }
      break
    }
    case 'content_block_start': {
      const contentBlock = event.content_block as Record<string, unknown> | undefined
      if (contentBlock?.type === 'tool_use') {
        send('on:chat:tool-call', { requestId, toolCall: { id: contentBlock.id, name: contentBlock.name, args: {}, status: 'running', startedAt: Date.now() } })
      }
      break
    }
    case 'content_block_stop':
      send('on:chat:tool-call-update', { requestId, index: event.index, status: 'completed', completedAt: Date.now() })
      break
    case 'message_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.stop_reason) send('on:chat:stop-reason', { requestId, stopReason: delta.stop_reason })
      break
    }
    case 'error':
      send('on:chat:error', { requestId, error: event.error })
      break
  }
}

// ===== SSE 流解析（累积 tool_use 信息） =====

interface ParsedToolCall { id: string; name: string; args: Record<string, unknown> }
interface ParsedStream { textContent: string; toolCalls: ParsedToolCall[]; stopReason: string | null }

/** 解析完整 SSE 流，同时转发事件到渲染进程并累积 tool_use 信息 */
async function parseSSEStream(
  body: NodeJS.ReadableStream,
  send: (channel: string, data: unknown) => void,
  requestId: string,
  cumulativeUsage: { inputTokens: number; outputTokens: number },
  indexOffset = 0,
): Promise<ParsedStream & { blockCount: number }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let textContent = ''
  let stopReason: string | null = null
  let maxIndex = -1
  const toolCalls: ParsedToolCall[] = []
  const toolJsonBuffers = new Map<number, { callIndex: number; json: string }>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      let event: Record<string, unknown>
      try { event = JSON.parse(data) } catch { continue }
      const type = event.type as string

      forwardSSEEvent(send, requestId, event, indexOffset)
      if (typeof event.index === 'number') maxIndex = Math.max(maxIndex, event.index)

      if (type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') textContent += delta.text
        if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const buf = toolJsonBuffers.get(event.index as number)
          if (buf) buf.json += delta.partial_json
        }
      }
      if (type === 'content_block_start') {
        const cb = event.content_block as Record<string, unknown> | undefined
        if (cb?.type === 'tool_use') {
          const idx = event.index as number
          toolJsonBuffers.set(idx, { callIndex: toolCalls.length, json: '' })
          toolCalls.push({ id: cb.id as string, name: cb.name as string, args: {} })
        }
      }
      if (type === 'content_block_stop') {
        const buf = toolJsonBuffers.get(event.index as number)
        if (buf) {
          try {
            const parsed = JSON.parse(buf.json || '{}')
            toolCalls[buf.callIndex].args = parsed
            send('on:chat:tool-call-args', { requestId, toolUseId: toolCalls[buf.callIndex].id, args: parsed })
          } catch { console.error(`[ai-proxy] failed to parse tool args JSON: ${buf.json}`) }
          toolJsonBuffers.delete(event.index as number)
        }
      }
      if (type === 'message_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.stop_reason) stopReason = delta.stop_reason as string
        const usage = event.usage as Record<string, unknown> | undefined
        if (usage && typeof usage.output_tokens === 'number') {
          cumulativeUsage.outputTokens += usage.output_tokens
          send('on:chat:usage', { requestId, ...cumulativeUsage })
        }
      }
      if (type === 'message_start') {
        const msg = event.message as Record<string, unknown> | undefined
        const usage = msg?.usage as Record<string, unknown> | undefined
        if (usage && typeof usage.input_tokens === 'number') {
          cumulativeUsage.inputTokens += usage.input_tokens
          send('on:chat:usage', { requestId, ...cumulativeUsage })
        }
      }
    }
  }
  return { textContent, toolCalls, stopReason, blockCount: maxIndex + 1 }
}

// ===== 工具执行（主进程内直接调用 store / webviewManager） =====

/** 根据工具名在主进程内执行对应操作，返回结果。 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  targetTabId?: string,
  enabledToolNames?: string[],
): Promise<unknown> {
  console.log(`[ai-proxy executeTool] name=${name}, args=${JSON.stringify(args)}`)
  try {
    switch (name) {
      case 'list_categories': return buildCategoryListResponse()
      case 'list_tools_by_category': {
        const category = args.category as string
        if (!category) return { error: 'category is required' }
        return buildToolListResponse(category, enabledToolNames)
      }
      case 'get_tool_detail': {
        const toolName = (args.tool_name || args.toolName || args.name) as string
        if (!toolName) return { error: 'tool_name is required' }
        return buildToolDetailResponse(toolName, enabledToolNames)
      }
      case 'execute_tool': {
        const toolName = (args.tool_name || args.toolName || args.name) as string
        const toolArgs = isRecord(args.args) ? args.args : {}
        if (!toolName) return { error: 'tool_name is required' }
        if (!isBrowserBusinessToolName(toolName)) return { error: `Unknown tool: ${toolName}` }
        if (enabledToolNames && !enabledToolNames.includes(toolName)) return { error: `Tool is disabled: ${toolName}` }
        const result = await executeTool(toolName, toolArgs, targetTabId, enabledToolNames)
        return { stage: 'execute', need_next: false, next_action: 'none', data: { tool: toolName, result }, message: '工具执行完成。' }
      }
      case 'list_tabs': {
        const tabs = listTabs()
        const activeTabId = webviewManager.getActiveTabId()
        const result = tabs.map((tab) => {
          const viewInfo = webviewManager.getViewInfo(tab.id)
          const page = tab.pageId ? getPageById(tab.pageId) : undefined
          const group = page?.groupId ? getGroupById(page.groupId) : undefined
          return {
            tabId: tab.id, pageId: tab.pageId, title: tab.title,
            url: viewInfo?.url ?? tab.url, isActive: tab.id === activeTabId,
            isFrozen: webviewManager.isFrozen(tab.id), pinned: tab.pinned, muted: tab.muted,
            groupName: group?.name,
          }
        })
        console.log(`[ai-proxy executeTool] list_tabs returning ${result.length} tabs`)
        return result
      }
      case 'list_groups': return listGroups()
      case 'list_workspaces': return listWorkspaces()
      case 'list_pages': return listPages()
      case 'get_active_tab': {
        const activeTabId = targetTabId || webviewManager.getActiveTabId()
        if (!activeTabId) return { error: '没有选中的标签页' }
        const viewInfo = webviewManager.getViewInfo(activeTabId)
        const tabs = listTabs()
        const tab = tabs.find((t) => t.id === activeTabId)
        if (!tab) return { error: `标签页 ${activeTabId} 不存在` }
        const page = tab.pageId ? getPageById(tab.pageId) : undefined
        const group = page?.groupId ? getGroupById(page.groupId) : undefined
        return {
          tabId: tab.id, pageId: tab.pageId, title: tab.title,
          url: viewInfo?.url ?? tab.url, isFrozen: webviewManager.isFrozen(tab.id),
          groupName: group?.name, containerId: page?.containerId,
        }
      }
      case 'create_tab': return executeCreateTab(args)
      case 'navigate_tab': {
        const tabId = (args.tabId as string) || webviewManager.getActiveTabId()
        const url = args.url as string
        if (!tabId || !url) return { error: 'tabId and url are required' }
        webviewManager.navigate(tabId, url)
        return { success: true, tabId, url }
      }
      case 'create_window':
      case 'navigate_window':
      case 'close_window':
      case 'list_windows':
      case 'focus_window':
      case 'screenshot_window':
      case 'get_window_detail':
        return executeWindowTool(name, args)
      case 'switch_tab': {
        const tabId = args.tabId as string
        if (!tabId) return { error: 'tabId is required' }
        webviewManager.switchView(tabId)
        return { success: true, tabId }
      }
      case 'close_tab': {
        const tabId = args.tabId as string
        if (!tabId) return { error: 'tabId is required' }
        webviewManager.destroyView(tabId)
        return { success: true, tabId }
      }
      case 'click_element':
      case 'input_text':
      case 'scroll_page':
      case 'get_page_content':
      case 'get_dom':
      case 'get_page_screenshot':
      case 'select_option':
      case 'hover_element':
        return executeBrowserTool(name, args)
      case 'get_page_summary':
      case 'get_page_markdown':
      case 'get_interactive_nodes':
      case 'get_interactive_node_detail':
        return executePageTool(name, args)
      case 'write_skill':
      case 'read_skill':
      case 'list_skills':
      case 'search_skill':
        return executeSkillTool(name, args)
      case 'inject_js': return executeInjectJs(args)
      default:
        console.warn(`[ai-proxy executeTool] unknown tool: ${name}`)
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    console.error(`[ai-proxy executeTool] error executing ${name}:`, err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** 测试供应商连接是否正常 */
export async function testProviderConnection(providerId: string): Promise<{ success: boolean; error?: string }> {
  const provider = getAIProvider(providerId)
  if (!provider) return { success: false, error: `Provider not found: ${providerId}` }
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
    if (response.ok) return { success: true }
    const errorText = await response.text()
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
