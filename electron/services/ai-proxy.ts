import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { getAIProvider, listTabs, createTab, listGroups, listPages, listWorkspaces, getPageById, getGroupById } from './store'
import { webviewManager } from './webview-manager'
import { extractPageSummary, extractPageMarkdown, extractInteractiveNodes, extractInteractiveNodeDetail } from './page-extractor'
import { writeSkill, readSkill, listSkills, searchSkill, extractCodeBlocks, replaceParams } from './skill-store'
import {
  buildCategoryListResponse,
  buildToolDetailResponse,
  buildToolListResponse,
  isBrowserBusinessToolName,
} from '../../src/lib/agent/tools'

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
}

/** 可重试的 HTTP 状态码（服务过载、限流、临时故障） */
const RETRYABLE_STATUS_CODES = new Set([429, 529, 500, 502, 503, 504])
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 2000

/** 活跃请求的 AbortController 映射，供外部中止 */
export const activeRequests = new Map<string, AbortController>()

/**
 * 判断错误是否可重试。
 * 529 (overloaded) 和 429 (rate_limit) 是典型场景。
 */
function isRetryableError(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status)
}

/**
 * 延迟指定毫秒数（指数退避）。
 */
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
  const { _requestId, providerId, modelId, system, messages, tools, stream, maxTokens, thinking, targetTabId, enabledToolNames } = params

  // 创建 AbortController 并注册到全局映射
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

    // 多轮对话循环：LLM 可能多次请求 tool_use
    let currentMessages = [...messages]
    let cumulativeUsage = { inputTokens: 0, outputTokens: 0 }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[ai-proxy] round ${round + 1}, messages count: ${currentMessages.length}`)

      const body: Record<string, unknown> = {
        model: modelId,
        messages: currentMessages,
        max_tokens: maxTokens ?? 4096,
        stream: true,
      }
      if (system) {
        body.system = system
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
          console.warn(
            `[ai-proxy] API error ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${retryDelay}ms...`,
          )
          send('on:chat:retry', {
            requestId: _requestId,
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            delayMs: retryDelay,
            status: response.status,
            error: lastErrorText,
          })
          await delay(retryDelay)
          continue
        }

        // 不可重试或已耗尽重试次数
        send('on:chat:error', { requestId: _requestId, error: `API error ${response.status}: ${lastErrorText}` })
        return
      }

      if (!response!.body) {
        send('on:chat:error', { requestId: _requestId, error: 'No response body' })
        return
      }

      // 解析 SSE 流，累积完整的 assistant message
      const parsed = await parseSSEStream(response.body, send, _requestId, cumulativeUsage)

      console.log(`[ai-proxy] round ${round + 1} done, stop_reason: ${parsed.stopReason}, tool_calls: ${parsed.toolCalls.length}`)

      // 没有 tool_use，正常结束
      if (parsed.stopReason !== 'tool_use' || parsed.toolCalls.length === 0) {
        send('on:chat:done', { requestId: _requestId, usage: cumulativeUsage })
        return
      }

      // === 工具执行阶段 ===
      console.log(`[ai-proxy] executing ${parsed.toolCalls.length} tool call(s)...`)

      // 构造 assistant message（含文本 + tool_use blocks）
      const assistantContent: Array<Record<string, unknown>> = []
      if (parsed.textContent) {
        assistantContent.push({ type: 'text', text: parsed.textContent })
      }
      for (const tc of parsed.toolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.args,
        })
      }

      // 执行每个工具，收集 tool_result
      const toolResults: Array<Record<string, unknown>> = []
      for (const tc of parsed.toolCalls) {
        console.log(`[ai-proxy] executing tool: ${tc.name}, args: ${JSON.stringify(tc.args)}`)
        const result = await executeTool(tc.name, tc.args, targetTabId, enabledToolNames)

        // 构建工具结果内容：图片需要结构化数组格式
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

        // 通知渲染进程：工具执行完成 + 结果
        // 安全序列化：部分工具可能返回不可直接克隆的对象（如 electron-store 的代理对象）
        const safeResult = typeof result === 'string'
          ? result
          : JSON.parse(JSON.stringify(result))
        send('on:chat:tool-result', {
          requestId: _requestId,
          toolUseId: tc.id,
          name: tc.name,
          result: safeResult,
        })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: toolResultContent,
        })
      }

      // 把 assistant message + tool_result 追加到消息历史，进入下一轮
      currentMessages.push({ role: 'assistant', content: assistantContent })
      currentMessages.push({ role: 'user', content: toolResults })
    }

    // 超过最大轮次，强制结束
    console.warn(`[ai-proxy] reached max tool rounds (${MAX_TOOL_ROUNDS}), stopping`)
    send('on:chat:done', { requestId: _requestId })
  } catch (error) {
    // AbortError 表示用户主动中止，静默处理
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log(`[ai-proxy] request ${_requestId} aborted by user`)
      return
    }
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[ai-proxy] request ${_requestId} aborted by user`)
      return
    }
    send('on:chat:error', {
      requestId: _requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    activeRequests.delete(_requestId)
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
      } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        send('on:chat:tool-call-args-delta', { requestId, index: event.index, delta: delta.partial_json })
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

// ===== SSE 流解析（累积 tool_use 信息） =====

interface ParsedToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

interface ParsedStream {
  textContent: string
  toolCalls: ParsedToolCall[]
  stopReason: string | null
}

/**
 * 解析完整 SSE 流，同时转发事件到渲染进程并累积 tool_use 信息。
 * cumulativeUsage 用于跨多轮 tool_use 循环累积 token 用量。
 */
async function parseSSEStream(
  body: NodeJS.ReadableStream,
  send: (channel: string, data: unknown) => void,
  requestId: string,
  cumulativeUsage: { inputTokens: number; outputTokens: number },
): Promise<ParsedStream> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let textContent = ''
  let stopReason: string | null = null

  // tool_use 累积状态
  // content_block 的 index 并不总是从 0 开始（前面可能有 text block），
  // 所以用 index → toolCalls 数组下标 的映射来关联
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

      // 转发事件给渲染进程
      forwardSSEEvent(send, requestId, event)

      // 累积文本 & tool_use 参数 JSON（都在 content_block_delta 事件中）
      if (type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          textContent += delta.text
        }
        // Anthropic 格式：delta.type === 'input_json_delta'，字段为 partial_json
        if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const idx = event.index as number
          const buf = toolJsonBuffers.get(idx)
          if (buf) {
            buf.json += delta.partial_json
          }
        }
      }

      // 累积 tool_use 开始
      if (type === 'content_block_start') {
        const cb = event.content_block as Record<string, unknown> | undefined
        if (cb?.type === 'tool_use') {
          const idx = event.index as number
          const callIndex = toolCalls.length
          toolCalls.push({ id: cb.id as string, name: cb.name as string, args: {} })
          toolJsonBuffers.set(idx, { callIndex, json: '' })
        }
      }

      // tool_use 参数结束 → 解析 JSON 并通知渲染进程
      if (type === 'content_block_stop') {
        const idx = event.index as number
        const buf = toolJsonBuffers.get(idx)
        if (buf) {
          try {
            const parsed = JSON.parse(buf.json || '{}')
            toolCalls[buf.callIndex].args = parsed
            // 将完整 args 回传给渲染进程
            send('on:chat:tool-call-args', {
              requestId,
              toolUseId: toolCalls[buf.callIndex].id,
              args: parsed,
            })
          } catch {
            console.error(`[ai-proxy] failed to parse tool args JSON: ${buf.json}`)
          }
          toolJsonBuffers.delete(idx)
        }
      }

      // stop_reason & usage
      if (type === 'message_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.stop_reason) {
          stopReason = delta.stop_reason as string
        }
        const usage = event.usage as Record<string, unknown> | undefined
        if (usage && typeof usage.output_tokens === 'number') {
          cumulativeUsage.outputTokens += usage.output_tokens
          send('on:chat:usage', { requestId, ...cumulativeUsage })
        }
      }

      // message_start 携带本輪 input_tokens
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

  return { textContent, toolCalls, stopReason }
}

// ===== 工具执行（主进程内直接调用 store / webviewManager） =====

/**
 * 根据工具名在主进程内执行对应操作，返回结果。
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  targetTabId?: string,
  enabledToolNames?: string[],
): Promise<unknown> {
  console.log(`[ai-proxy executeTool] name=${name}, args=${JSON.stringify(args)}`)

  try {
    switch (name) {
      case 'list_categories': {
        return buildCategoryListResponse()
      }

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
        if (enabledToolNames && !enabledToolNames.includes(toolName)) {
          return { error: `Tool is disabled: ${toolName}` }
        }

        const result = await executeTool(toolName, toolArgs, targetTabId, enabledToolNames)
        return {
          stage: 'execute',
          need_next: false,
          next_action: 'none',
          data: {
            tool: toolName,
            result,
          },
          message: '工具执行完成。',
        }
      }

      case 'list_tabs': {
        const tabs = listTabs()
        const activeTabId = webviewManager.getActiveTabId()
        const result = tabs.map((tab) => {
          const viewInfo = webviewManager.getViewInfo(tab.id)
          const page = tab.pageId ? getPageById(tab.pageId) : undefined
          const group = page?.groupId ? getGroupById(page.groupId) : undefined
          return {
            tabId: tab.id,
            pageId: tab.pageId,
            title: tab.title,
            url: viewInfo?.url ?? tab.url,
            isActive: tab.id === activeTabId,
            isFrozen: webviewManager.isFrozen(tab.id),
            pinned: tab.pinned,
            muted: tab.muted,
            groupName: group?.name,
          }
        })
        console.log(`[ai-proxy executeTool] list_tabs returning ${result.length} tabs`)
        return result
      }

      case 'list_groups': {
        return listGroups()
      }

      case 'list_workspaces': {
        return listWorkspaces()
      }

      case 'list_pages': {
        return listPages()
      }

      case 'get_active_tab': {
        const activeTabId = targetTabId || webviewManager.getActiveTabId()
        if (!activeTabId) {
          return { error: '没有选中的标签页' }
        }
        const viewInfo = webviewManager.getViewInfo(activeTabId)
        const tabs = listTabs()
        const tab = tabs.find((t) => t.id === activeTabId)
        if (!tab) {
          return { error: `标签页 ${activeTabId} 不存在` }
        }
        const page = tab.pageId ? getPageById(tab.pageId) : undefined
        const group = page?.groupId ? getGroupById(page.groupId) : undefined
        return {
          tabId: tab.id,
          pageId: tab.pageId,
          title: tab.title,
          url: viewInfo?.url ?? tab.url,
          isFrozen: webviewManager.isFrozen(tab.id),
          groupName: group?.name,
          containerId: page?.containerId,
        }
      }

      case 'create_tab': {
        const url = (args.url as string) || 'https://www.baidu.com'
        const active = args.active !== false // 默认激活
        const newWindow = args.newWindow as boolean | undefined
        const pageId = (args.pageId as string) || null
        const containerId = (args.containerId as string) || ''
        let workspaceId = args.workspaceId as string | undefined
        const tabs = listTabs()

        // 未指定工作区时，从当前激活标签页反推
        if (!workspaceId) {
          const activeTabId = webviewManager.getActiveTabId()
          if (activeTabId) {
            const activeTab = tabs.find((t) => t.id === activeTabId)
            if (activeTab?.pageId) {
              const page = getPageById(activeTab.pageId)
              if (page?.groupId) {
                const group = getGroupById(page.groupId)
                workspaceId = group?.workspaceId
              }
            }
          }
        }

        // 新窗口模式：创建独立 BrowserWindow
        if (newWindow) {
          const resolvedContainerId = pageId
            ? (getPageById(pageId)?.containerId || '')
            : containerId
          const partition = resolvedContainerId
            ? `persist:container-${resolvedContainerId}`
            : undefined
          const win = new BrowserWindow({
            width: 1280,
            height: 800,
            show: false,
            autoHideMenuBar: true,
            title: pageId ? (getPageById(pageId)?.name ?? '新窗口') : '新窗口',
            webPreferences: {
              partition,
              sandbox: false
            }
          })
          win.loadURL(url)
          win.once('ready-to-show', () => win.show())
          return {
            success: true,
            mode: 'window',
            windowId: win.id,
            title: pageId ? (getPageById(pageId)?.name ?? '新窗口') : '新窗口',
            url,
            containerId: resolvedContainerId || undefined,
          }
        }

        const order = tabs.reduce((max, t) => Math.max(max, t.order), -1) + 1
        const mainWindow = webviewManager.getMainWindow()

        if (pageId) {
          const page = getPageById(pageId)
          if (!page) return { error: `页面 ${pageId} 不存在` }
          const tabUrl = url || page.url
          const tab = createTab({ pageId, title: page.name, url: tabUrl, order })
          webviewManager.registerPendingView(tab.id, pageId, page.containerId || '', tabUrl)
          mainWindow?.webContents.send('on:tab:created', tab)
          if (active) webviewManager.switchView(tab.id)
          return {
            success: true,
            mode: 'tab',
            tabId: tab.id,
            pageId,
            containerId: page.containerId || undefined,
            title: tab.title,
            url: tabUrl,
            workspaceId,
          }
        }

        const tab = createTab({
          pageId: '',
          title: '新标签页',
          url,
          order,
          workspaceId
        })
        webviewManager.registerPendingView(tab.id, '', containerId, url)
        mainWindow?.webContents.send('on:tab:created', tab)
        if (active) webviewManager.switchView(tab.id)
        return {
          success: true,
          mode: 'tab',
          tabId: tab.id,
          pageId: '',
          containerId: containerId || undefined,
          title: tab.title,
          url,
          workspaceId,
        }
      }

      case 'navigate_tab': {
        const tabId = (args.tabId as string) || webviewManager.getActiveTabId()
        const url = args.url as string
        if (!tabId || !url) return { error: 'tabId and url are required' }
        webviewManager.navigate(tabId, url)
        return { success: true, tabId, url }
      }

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

      // 浏览器交互工具（需要 CDP / executeJavaScript）
      case 'click_element': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        if (!args.selector || typeof args.selector !== 'string') return { error: 'selector is required' }
        const selector = args.selector as string
        await wc.executeJavaScript(`document.querySelector('${cssEscape(selector)}')?.click()`)
        return { success: true }
      }

      case 'input_text': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        if (!args.text || typeof args.text !== 'string') return { error: 'text is required' }
        const text = (args.text as string).replace(/'/g, "\\'")
        const selector = args.selector as string | undefined
        if (selector) {
          await wc.executeJavaScript(`
            const el = document.querySelector('${cssEscape(selector)}')
            if (el) { el.focus(); el.value = '${text}'; el.dispatchEvent(new Event('input', { bubbles: true })) }
          `)
        } else {
          await wc.executeJavaScript(`
            const el = document.activeElement
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
              if (el.isContentEditable) { el.textContent += '${text}' }
              else { el.value += '${text}'; el.dispatchEvent(new Event('input', { bubbles: true })) }
            }
          `)
        }
        return { success: true }
      }

      case 'scroll_page': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const amount = (args.amount as number) || 300
        const scrollMap: Record<string, string> = {
          up: `window.scrollBy(0, -${amount})`,
          down: `window.scrollBy(0, ${amount})`,
          left: `window.scrollBy(-${amount}, 0)`,
          right: `window.scrollBy(${amount}, 0)`,
        }
        await wc.executeJavaScript(scrollMap[args.direction as string] ?? '')
        return { success: true }
      }

      case 'get_page_content': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        try {
          const content = await wc.executeJavaScript('document.body.innerText')
          return { content }
        } catch (err) {
          return { error: `Failed to get page content: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_dom': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const selector = args.selector as string
        if (!selector) return { error: 'selector is required' }
        try {
          const html = await wc.executeJavaScript(`document.querySelector('${cssEscape(selector)}')?.outerHTML ?? null`)
          if (!html) return { error: `Element not found: ${selector}` }
          return { html }
        } catch (err) {
          return { error: `Failed to get DOM: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_page_screenshot': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        try {
          const image = await wc.capturePage()
          if (image.isEmpty()) return { error: 'Page is empty or not loaded' }
          const jpeg = image.toJPEG(80)
          const size = image.getSize()

          // 保存到临时文件
          const filename = `screenshot-${Date.now()}.jpg`
          const screenshotDir = join(app.getPath('userData'), 'ai-screenshots')
          mkdirSync(screenshotDir, { recursive: true })
          writeFileSync(join(screenshotDir, filename), jpeg)

          const base64 = jpeg.toString('base64')
          return {
            _isImageContent: true,
            url: `screenshot://${filename}`,
            mediaType: 'image/jpeg',
            data: base64,
            width: size.width,
            height: size.height,
          }
        } catch (err) {
          return { error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'select_option': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        if (!args.selector || typeof args.selector !== 'string') return { error: 'selector is required' }
        if (!args.value || typeof args.value !== 'string') return { error: 'value is required' }
        const selector = args.selector as string
        const value = (args.value as string).replace(/'/g, "\\'")
        await wc.executeJavaScript(`
          const el = document.querySelector('${cssEscape(selector)}')
          if (el) { el.value = '${value}'; el.dispatchEvent(new Event('change', { bubbles: true })) }
        `)
        return { success: true }
      }

      case 'hover_element': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        if (!args.selector || typeof args.selector !== 'string') return { error: 'selector is required' }
        const selector = args.selector as string
        await wc.executeJavaScript(`
          const el = document.querySelector('${cssEscape(selector)}')
          if (el) { el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
        `)
        return { success: true }
      }

      // ===== 页面感知工具 =====
      case 'get_page_summary': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          return await extractPageSummary(wc)
        } catch (err) {
          return { error: `Failed to get page summary: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_page_markdown': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          const maxLength = (args.maxLength as number) || 10000
          return await extractPageMarkdown(wc, maxLength)
        } catch (err) {
          return { error: `Failed to get page markdown: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_interactive_nodes': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          const viewportOnly = args.viewportOnly !== false
          return await extractInteractiveNodes(wc, viewportOnly)
        } catch (err) {
          return { error: `Failed to get interactive nodes: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'get_interactive_node_detail': {
        const wc = getWebContentsFromManager(args.tabId as string | undefined)
        if (!wc) return { error: 'Tab not found' }
        const pageCheck = checkPageAvailable(wc)
        if (pageCheck) return pageCheck
        try {
          const selector = args.selector as string
          if (!selector) return { error: 'selector is required' }
          return await extractInteractiveNodeDetail(wc, selector)
        } catch (err) {
          return { error: `Failed to get node detail: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      // ===== 技能管理工具 =====
      case 'write_skill': {
        const skillName = args.name as string
        const skillDesc = args.description as string
        const skillContent = args.content as string
        if (!skillName || !skillDesc || !skillContent) {
          return { error: 'name, description, content 均为必填' }
        }
        try {
          const skill = writeSkill(skillName, skillDesc, skillContent)
          return { success: true, name: skill.name, message: `Skill "${skill.name}" 已保存` }
        } catch (err) {
          return { error: `保存失败: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      case 'read_skill': {
        const skillName = args.name as string
        if (!skillName) return { error: 'name 为必填' }
        const skill = readSkill(skillName)
        if (!skill) return { error: `Skill "${skillName}" 不存在` }
        return { name: skill.name, description: skill.description, content: skill.content, updated: skill.updated }
      }

      case 'list_skills': {
        const skills = listSkills()
        return { skills, total: skills.length }
      }

      case 'search_skill': {
        const query = args.name as string
        if (!query) return { error: 'name (搜索关键词) 为必填' }
        const results = searchSkill(query)
        return { skills: results, total: results.length }
      }

      case 'exec_skill': {
        const skillName = args.name as string
        const params = (args.params as Record<string, unknown>) ?? {}
        if (!skillName) return { error: 'name 为必填' }

        const skill = readSkill(skillName)
        if (!skill) {
          // 找不到时自动搜索，返回候选列表
          const candidates = searchSkill(skillName)
          if (candidates.length > 0) {
            return { error: `Skill "${skillName}" 不存在`, suggestion: '以下是相近的 Skill：', candidates }
          }
          return { error: `Skill "${skillName}" 不存在，也没有相近匹配` }
        }

        // 提取 JS 代码块并在目标标签页中执行
        const codeBlocks = extractCodeBlocks(skill.content)
        const results: Array<{ step: number; success: boolean; result?: unknown; error?: string }> = []

        if (codeBlocks.length > 0) {
          const wc = getWebContentsFromManager(targetTabId)
          if (!wc) {
            return {
              name: skill.name,
              description: skill.description,
              content: skill.content,
              executionError: '没有可用的标签页来执行代码块',
            }
          }

          for (let i = 0; i < codeBlocks.length; i++) {
            const code = replaceParams(codeBlocks[i], params)
            try {
              const result = await wc.executeJavaScript(buildSkillExecutionScript(code, params, targetTabId))
              results.push({ step: i + 1, success: true, result })
            } catch (err) {
              results.push({
                step: i + 1,
                success: false,
                error: err instanceof Error ? err.message : String(err),
                result: { code },
              })
            }
          }
        }

        return {
          name: skill.name,
          description: skill.description,
          steps: skill.content,
          executionResults: results.length > 0 ? results : undefined,
        }
      }

      default:
        console.warn(`[ai-proxy executeTool] unknown tool: ${name}`)
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    console.error(`[ai-proxy executeTool] error executing ${name}:`, err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** 检查页面是否可用于内容提取（内部页面、未加载完成） */
function checkPageAvailable(wc: Electron.WebContents): { error: string } | null {
  const url = wc.getURL()
  if (
    url.startsWith('sessionbox://') ||
    url === 'about:blank' ||
    url.startsWith('chrome-error://') ||
    url === ''
  ) {
    return { error: 'Cannot extract content from internal pages' }
  }
  if (wc.isLoading()) {
    return { error: 'Page is still loading' }
  }
  return null
}

/** 获取 webContents */
function getWebContentsFromManager(tabId?: string): Electron.WebContents | null {
  if (!tabId) {
    tabId = webviewManager.getActiveTabId() ?? undefined
  }
  if (!tabId) return null
  return webviewManager.getWebContents?.(tabId) ?? null
}

/** CSS 选择器转义 */
function cssEscape(selector: string): string {
  return selector.replace(/'/g, "\\'")
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildSkillExecutionScript(
  code: string,
  params: Record<string, unknown>,
  targetTabId?: string,
): string {
  const serializedParams = serializeForScript(params)
  const serializedTabId = serializeForScript(targetTabId ?? null)

  return `(() => {
    const params = ${serializedParams}
    const tabId = ${serializedTabId}

    const ensureElement = (selector, fnName = 'query') => {
      if (typeof selector !== 'string' || !selector) {
        throw new Error(\`\${fnName}: selector is required\`)
      }

      const el = document.querySelector(selector)
      if (!el) {
        throw new Error(\`\${fnName}: element not found for selector \${selector}\`)
      }
      return el
    }

    const normalizeObjectArgs = (value, fnName) => {
      if (value === undefined || value === null) return {}
      if (typeof value === 'object' && !Array.isArray(value)) return value
      throw new Error(\`\${fnName}: arguments must be an object or empty\`)
    }

    const getAccessibleName = (el) => {
      const labelledBy = el.getAttribute('aria-labelledby')
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy)
        if (labelEl && labelEl.textContent) return labelEl.textContent.trim().slice(0, 100)
      }
      return (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        (el.textContent || '').trim().slice(0, 100) ||
        ''
      )
    }

    const generateSelector = (el) => {
      if (el.id) return '#' + CSS.escape(el.id)
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).filter((cls) => cls && !cls.startsWith('__'))
        for (const cls of classes) {
          const selector = '.' + CSS.escape(cls)
          if (document.querySelectorAll(selector).length === 1) return selector
        }
      }
      const parent = el.parentElement
      if (!parent) return el.tagName.toLowerCase()
      const siblings = Array.from(parent.children)
      const index = siblings.indexOf(el) + 1
      return el.tagName.toLowerCase() + ':nth-child(' + index + ')'
    }

    const input_text = async (arg1, arg2) => {
      const options = typeof arg1 === 'object' && arg1 !== null
        ? arg1
        : { selector: arg1, text: arg2 }
      const selector = options.selector
      const text = options.text

      if (typeof text !== 'string') {
        throw new Error('input_text: text must be a string')
      }

      const el = ensureElement(selector, 'input_text')
      if (!(el instanceof HTMLElement)) {
        throw new Error(\`input_text: unsupported element for selector \${selector}\`)
      }

      el.focus()
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = text
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { success: true }
      }

      if (el.isContentEditable) {
        el.textContent = text
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return { success: true }
      }

      throw new Error(\`input_text: selector \${selector} is not an input, textarea, or contenteditable element\`)
    }

    const click_element = async (arg) => {
      const options = typeof arg === 'object' && arg !== null ? arg : { selector: arg }
      const selector = options.selector
      const el = ensureElement(selector, 'click_element')
      if (!(el instanceof HTMLElement)) {
        throw new Error(\`click_element: unsupported element for selector \${selector}\`)
      }

      el.click()
      return { success: true }
    }

    const hover_element = async (arg) => {
      const options = typeof arg === 'object' && arg !== null ? arg : { selector: arg }
      const selector = options.selector
      const el = ensureElement(selector, 'hover_element')
      if (!(el instanceof HTMLElement)) {
        throw new Error(\`hover_element: unsupported element for selector \${selector}\`)
      }

      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      return { success: true }
    }

    const select_option = async (arg1, arg2) => {
      const options = typeof arg1 === 'object' && arg1 !== null
        ? arg1
        : { selector: arg1, value: arg2 }
      const selector = options.selector
      const value = options.value

      if (typeof value !== 'string') {
        throw new Error('select_option: value must be a string')
      }

      const el = ensureElement(selector, 'select_option')
      if (!(el instanceof HTMLSelectElement)) {
        throw new Error(\`select_option: selector \${selector} is not a select element\`)
      }

      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { success: true }
    }

    const scroll_page = async (arg) => {
      const options = typeof arg === 'object' && arg !== null ? arg : { direction: arg }
      const direction = options.direction
      const amount = typeof options.amount === 'number' ? options.amount : 300
      const scrollMap = {
        up: [0, -amount],
        down: [0, amount],
        left: [-amount, 0],
        right: [amount, 0],
      }
      const delta = scrollMap[direction]
      if (!delta) {
        throw new Error('scroll_page: direction must be one of up/down/left/right')
      }

      window.scrollBy(delta[0], delta[1])
      return { success: true }
    }

    const get_dom = async (arg) => {
      const options = typeof arg === 'object' && arg !== null ? arg : { selector: arg }
      const selector = options.selector
      const el = ensureElement(selector, 'get_dom')
      return { html: el.outerHTML }
    }

    const get_page_content = async () => ({
      content: document.body?.innerText ?? '',
    })

    const get_page_summary = async () => {
      const getMeta = (name) => {
        const el = document.querySelector('meta[name="' + name + '"]') ||
          document.querySelector('meta[property="' + name + '"]')
        return el ? el.getAttribute('content') || '' : ''
      }

      return {
        title: document.title || '',
        url: location.href,
        description: getMeta('description'),
        headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
          level: Number.parseInt(h.tagName[1], 10),
          text: (h.textContent || '').trim(),
        })),
        links: Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map((a) => ({
          text: (a.textContent || '').trim(),
          href: a.href,
        })),
        meta: {
          author: getMeta('author'),
          keywords: getMeta('keywords'),
          ogTitle: getMeta('og:title'),
          ogDescription: getMeta('og:description'),
        },
      }
    }

    const get_page_markdown = async (arg) => {
      const options = normalizeObjectArgs(arg, 'get_page_markdown')
      const maxLength = typeof options.maxLength === 'number' ? options.maxLength : 10000
      let markdown = document.body?.innerText ?? ''
      let truncated = false

      if (markdown.length > maxLength) {
        markdown = markdown.slice(0, maxLength) + '\\n\\n[truncated]'
        truncated = true
      }

      return {
        title: document.title || '',
        byline: '',
        excerpt: '',
        markdown,
        contentLength: (document.body?.innerText ?? '').length,
        truncated,
      }
    }

    const get_interactive_nodes = async (arg) => {
      const options = normalizeObjectArgs(arg, 'get_interactive_nodes')
      const viewportOnly = options.viewportOnly !== false

      const INTERACTIVE_TAGS = new Set([
        'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT',
        'SUMMARY', 'DETAILS', 'OPTION', 'LABEL',
      ])
      const INTERACTIVE_ROLES = new Set([
        'button', 'link', 'textbox', 'checkbox', 'radio',
        'combobox', 'menuitem', 'tab', 'switch', 'slider',
        'searchbox', 'menu', 'menubar', 'toolbar', 'dialog',
        'treeitem', 'option', 'gridcell',
      ])

      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }

      const isVisible = (el) => {
        const style = getComputedStyle(el)
        if (style.display === 'none') return false
        if (style.visibility === 'hidden') return false
        if (Number.parseFloat(style.opacity) <= 0) return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }

      const isInViewport = (el) => {
        const rect = el.getBoundingClientRect()
        return rect.top < viewport.height && rect.bottom > 0 && rect.left < viewport.width && rect.right > 0
      }

      const isInteractive = (el) => {
        if (el.tagName === 'INPUT' && el.type === 'hidden') return false
        if (INTERACTIVE_TAGS.has(el.tagName)) return true
        if (el.tagName === 'A' && el.hasAttribute('href')) return true
        const role = el.getAttribute('role')
        if (role && INTERACTIVE_ROLES.has(role)) return true
        return el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1'
      }

      const nodes = []
      for (const el of document.querySelectorAll('*')) {
        if (!isInteractive(el)) continue
        if (!isVisible(el)) continue
        if (viewportOnly && !isInViewport(el)) continue

        nodes.push({
          name: getAccessibleName(el),
          text: (el.textContent || '').trim().slice(0, 200),
          selector: generateSelector(el),
        })
      }

      return Object.assign(nodes, { nodes, viewport })
    }

    const get_interactive_node_detail = async (arg) => {
      const options = typeof arg === 'object' && arg !== null ? arg : { selector: arg }
      const selector = options.selector
      const el = ensureElement(selector, 'get_interactive_node_detail')
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const attributes = {}
      const skipAttrs = new Set(['class', 'style', 'id', 'tabindex'])

      for (const attr of Array.from(el.attributes || [])) {
        if (!skipAttrs.has(attr.name) && !attr.name.startsWith('on')) {
          attributes[attr.name] = attr.value
        }
      }

      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        name: getAccessibleName(el),
        text: (el.textContent || '').trim().slice(0, 200),
        selector,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        visible: style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0,
        clickable: typeof el.onclick === 'function' || el.tagName === 'BUTTON' || (el.tagName === 'A' && el.hasAttribute('href')),
        attributes,
        styles: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          cursor: style.cursor,
        },
        value: 'value' in el ? el.value : undefined,
        href: 'href' in el ? el.href : undefined,
      }
    }

    return (async () => {
      ${code}
    })()
  })()`
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
