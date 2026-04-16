import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { getAIProvider, listTabs, listGroups, listPages, listWorkspaces, getPageById, getGroupById } from './store'
import { webviewManager } from './webview-manager'
import { extractPageSummary, extractPageMarkdown, extractInteractiveNodes, extractInteractiveNodeDetail } from './page-extractor'

interface ProxyRequest {
  _requestId: string
  providerId: string
  modelId: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
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
  const { _requestId, providerId, modelId, messages, tools, stream, maxTokens, thinking, targetTabId } = params
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
        const result = await executeTool(tc.name, tc.args, targetTabId)

        // 构建工具结果内容：图片需要结构化数组格式
        let toolResultContent: string | Array<Record<string, unknown>>
        if (result && typeof result === 'object' && '_isImageContent' in result) {
          const img = result as { mediaType: string; data: string; width: number; height: number }
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
        send('on:chat:tool-result', {
          requestId: _requestId,
          toolUseId: tc.id,
          name: tc.name,
          result,
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
async function executeTool(name: string, args: Record<string, unknown>, targetTabId?: string): Promise<unknown> {
  console.log(`[ai-proxy executeTool] name=${name}, args=${JSON.stringify(args)}`)

  try {
    switch (name) {
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
        // 通过 IPC 让主进程创建标签页，这里只返回提示
        return { message: '请使用 chat:completions 接口创建标签页', hint: 'not yet supported in tool execution' }
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

      case 'type_text': {
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
