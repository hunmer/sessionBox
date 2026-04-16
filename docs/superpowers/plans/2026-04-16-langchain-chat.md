# LangChain Chat 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SessionBox 添加基于 LangChain.js 的 AI 聊天界面，用户可通过自然语言操控浏览器标签页和页面内容。

**Architecture:** 渲染进程运行 LangChain Agent（零延迟 IPC 调用），主进程代理 LLM API 请求（保护 API Key）。聊天数据存 Dexie（IndexedDB），供应商配置存 electron-store。UI 采用四面板布局，ChatPanel 作为可调整宽度的 ResizablePanel。

**Tech Stack:** LangChain.js + @langchain/anthropic, Dexie (IndexedDB), Pinia, shadcn-vue, Tailwind CSS, electron-store, marked + highlight.js

**注意：** 本项目当前无测试框架。每个 Task 包含手动验证步骤替代自动化测试。每个 Task 完成后应独立可编译。

---

## 文件结构总览

```
新增文件:
  src/lib/chat-db.ts              ← Dexie 聊天数据库（会话+消息）
  src/lib/agent/agent.ts          ← LangChain Agent 初始化与运行
  src/lib/agent/tools.ts          ← 浏览器交互工具注册（IPC 桥接）
  src/lib/agent/stream.ts         ← 流式输出处理
  src/lib/agent/system-prompt.ts  ← 系统提示词
  src/stores/chat.ts              ← 聊天 Pinia Store
  src/stores/ai-provider.ts       ← 供应商/模型配置 Store
  src/components/chat/ChatPanel.vue
  src/components/chat/ChatMessageList.vue
  src/components/chat/ChatInput.vue
  src/components/chat/ChatMessage.vue
  src/components/chat/ToolCallCard.vue
  src/components/chat/ThinkingBlock.vue
  src/components/chat/SessionManager.vue
  src/components/chat/ModelSelector.vue
  src/components/chat/BrowserViewPicker.vue
  src/components/chat/ProviderManager.vue
  electron/ipc/chat.ts            ← 聊天 IPC（API 代理）
  electron/ipc/ai-provider.ts     ← 供应商管理 IPC
  electron/services/ai-proxy.ts   ← LLM API 代理服务

修改文件:
  src/types/index.ts              ← 新增 Chat/Provider 类型
  preload/index.ts                ← 新增 chat / aiProvider / browser API
  electron/services/store.ts      ← 新增 AIProvider 数据模型
  electron/ipc/index.ts           ← 注册 chat/ai-provider IPC
  electron/main.ts                ← 注册 chat/ai-provider IPC
  src/App.vue                     ← 四面板布局集成
  package.json                    ← 新增依赖
```

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 LangChain 和相关依赖**

```bash
cd /Users/Zhuanz/Documents/sessionBox
pnpm add @langchain/anthropic @langchain/core langchain marked highlight.js
```

- [ ] **Step 2: 验证安装成功**

```bash
pnpm ls @langchain/anthropic @langchain/core langchain marked highlight.js
```

Expected: 所有包列出版本号，无报错。

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add LangChain and chat UI dependencies"
```

---

## Task 2: 类型定义

**Files:**
- Modify: `src/types/index.ts`

在 `src/types/index.ts` 末尾添加聊天相关的类型定义。这些类型将被 preload、主进程、渲染进程三处共享。

- [ ] **Step 1: 添加 Chat 相关类型到 `src/types/index.ts`**

在文件末尾追加：

```typescript
// ==================== AI Chat 类型 ====================

export interface ChatSession {
  id: string
  title: string
  browserViewId: string | null
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: unknown
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolCalls?: ToolCall[]
  toolResult?: unknown
  thinking?: string
  images?: string[]
  modelId?: string
  createdAt: number
}

export interface AIProvider {
  id: string
  name: string
  apiBase: string
  apiKey: string
  models: AIModel[]
  enabled: boolean
  createdAt: number
}

export interface AIModel {
  id: string
  name: string
  providerId: string
  maxTokens: number
  supportsVision: boolean
  supportsThinking: boolean
}

// API 代理请求参数
export interface ChatCompletionParams {
  providerId: string
  modelId: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
}

// 浏览器交互工具参数
export interface BrowserClickArgs {
  selector?: string
  x?: number
  y?: number
  tabId?: string
}

export interface BrowserTypeArgs {
  text: string
  selector?: string
  tabId?: string
}

export interface BrowserScrollArgs {
  direction: 'up' | 'down' | 'left' | 'right'
  amount: number
  tabId?: string
}

export interface BrowserSelectArgs {
  selector: string
  value: string
  tabId?: string
}

export interface BrowserHoverArgs {
  selector: string
  tabId?: string
}

export interface BrowserGetContentArgs {
  tabId?: string
}

export interface BrowserGetDomArgs {
  selector: string
  tabId?: string
}

export interface BrowserScreenshotArgs {
  tabId?: string
  format?: 'png' | 'jpeg'
}
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

Expected: 编译成功，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(chat): add AI chat type definitions"
```

---

## Task 3: Dexie 聊天数据库

**Files:**
- Create: `src/lib/chat-db.ts`

按照 `src/lib/db.ts`（浏览历史）的已有模式，创建聊天数据库。

- [ ] **Step 1: 创建 `src/lib/chat-db.ts`**

```typescript
import Dexie, { type Table } from 'dexie'
import type { ChatSession, ChatMessage } from '@/types'

class ChatDB extends Dexie {
  sessions!: Table<ChatSession, string>
  messages!: Table<ChatMessage, string>

  constructor() {
    super('sessionbox-chat')
    this.version(1).stores({
      sessions: 'id, updatedAt, createdAt',
      messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
    })
  }
}

export const chatDb = new ChatDB()
export const MAX_MESSAGES_PER_SESSION = 5000

// ===== 会话操作 =====

export async function createSession(
  modelId: string,
  providerId: string,
  browserViewId: string | null = null,
): Promise<ChatSession> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const session: ChatSession = {
    id,
    title: '新对话',
    browserViewId,
    modelId,
    providerId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  }
  await chatDb.sessions.add(session)
  return session
}

export async function listSessions(): Promise<ChatSession[]> {
  return chatDb.sessions.orderBy('updatedAt').reverse().toArray()
}

export async function deleteSession(id: string): Promise<void> {
  await chatDb.messages.where('sessionId').equals(id).delete()
  await chatDb.sessions.delete(id)
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await chatDb.sessions.update(id, { title, updatedAt: Date.now() })
}

export async function updateSessionBrowserView(id: string, browserViewId: string | null): Promise<void> {
  await chatDb.sessions.update(id, { browserViewId, updatedAt: Date.now() })
}

// ===== 消息操作 =====

export async function addMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
  const id = crypto.randomUUID()
  const msg: ChatMessage = { ...message, id }
  await chatDb.messages.add(msg)

  // 更新会话的 updatedAt 和 messageCount
  const session = await chatDb.sessions.get(message.sessionId)
  if (session) {
    await chatDb.sessions.update(message.sessionId, {
      updatedAt: Date.now(),
      messageCount: session.messageCount + 1,
    })
  }

  // 超过上限时删除最早的消息
  const count = await chatDb.messages.where('sessionId').equals(message.sessionId).count()
  if (count > MAX_MESSAGES_PER_SESSION) {
    const oldest = await chatDb.messages
      .where('sessionId')
      .equals(message.sessionId)
      .sortBy('createdAt')
    const toDelete = oldest.slice(0, count - MAX_MESSAGES_PER_SESSION).map((m) => m.id!)
    await chatDb.messages.bulkDelete(toDelete)
  }

  return msg
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  return chatDb.messages
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt')
}

export async function updateMessage(id: string, updates: Partial<ChatMessage>): Promise<void> {
  await chatDb.messages.update(id, updates)
}

export async function clearMessages(sessionId: string): Promise<void> {
  await chatDb.messages.where('sessionId').equals(sessionId).delete()
  await chatDb.sessions.update(sessionId, {
    messageCount: 0,
    updatedAt: Date.now(),
  })
}
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/chat-db.ts
git commit -m "feat(chat): add Dexie chat database with session and message CRUD"
```

---

## Task 4: 主进程 — AI Provider 数据模型

**Files:**
- Modify: `electron/services/store.ts`

在 electron-store 的 `StoreSchema` 中添加 `aiProviders`，并提供 CRUD 操作函数。

- [ ] **Step 1: 在 `electron/services/store.ts` 顶部类型定义区追加 AIProvider 类型**

在 `zoomPreferences` 的接口定义之后、`StoreSchema` 之前，添加：

```typescript
export interface AIProviderStore {
  id: string
  name: string
  apiBase: string
  apiKey: string
  models: AIModelStore[]
  enabled: boolean
  createdAt: number
}

export interface AIModelStore {
  id: string
  name: string
  providerId: string
  maxTokens: number
  supportsVision: boolean
  supportsThinking: boolean
}
```

注意：主进程类型使用 `AIProviderStore` / `AIModelStore` 后缀，与渲染进程类型 `AIProvider` / `AIModel` 区分（主进程结构相同但独立定义，避免跨进程导入）。

- [ ] **Step 2: 在 `StoreSchema` 接口中添加 `aiProviders` 字段**

```typescript
interface StoreSchema {
  // ... 现有字段 ...
  zoomPreferences: Record<string, number>
  aiProviders: AIProviderStore[]   // ← 新增
}
```

- [ ] **Step 3: 在 `defaults` 中添加默认值**

```typescript
const defaults: StoreSchema = {
  // ... 现有默认值 ...
  zoomPreferences: {},
  aiProviders: [],   // ← 新增
}
```

- [ ] **Step 4: 在文件末尾（store CRUD 函数区域）添加 AIProvider 操作函数**

```typescript
// ===== AI Provider CRUD =====

export function listAIProviders(): AIProviderStore[] {
  return store.get('aiProviders', [])
}

export function getAIProvider(id: string): AIProviderStore | undefined {
  return store.get('aiProviders', []).find((p) => p.id === id)
}

export function createAIProvider(data: Omit<AIProviderStore, 'id' | 'createdAt'>): AIProviderStore {
  const providers = store.get('aiProviders', [])
  const provider: AIProviderStore = {
    ...data,
    id: randomUUID(),
    createdAt: Date.now(),
  }
  providers.push(provider)
  store.set('aiProviders', providers)
  return provider
}

export function updateAIProvider(id: string, updates: Partial<AIProviderStore>): AIProviderStore | undefined {
  const providers = store.get('aiProviders', [])
  const index = providers.findIndex((p) => p.id === id)
  if (index === -1) return undefined
  providers[index] = { ...providers[index], ...updates }
  store.set('aiProviders', providers)
  return providers[index]
}

export function deleteAIProvider(id: string): boolean {
  const providers = store.get('aiProviders', [])
  const index = providers.findIndex((p) => p.id === id)
  if (index === -1) return false
  providers.splice(index, 1)
  store.set('aiProviders', providers)
  return true
}
```

- [ ] **Step 5: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add electron/services/store.ts
git commit -m "feat(chat): add AIProvider data model to electron-store"
```

---

## Task 5: 主进程 — AI Proxy 服务

**Files:**
- Create: `electron/services/ai-proxy.ts`

这是主进程的 LLM API 代理服务。接收渲染进程的请求，注入 API Key，向供应商 API 发送请求，解析 SSE 流并通过 `webContents.send` 回传。

- [ ] **Step 1: 创建 `electron/services/ai-proxy.ts`**

```typescript
import { BrowserWindow } from 'electron'
import { getAIProvider } from './store'
import type { ChatCompletionParams } from '../../src/types'

interface ProxyRequest extends ChatCompletionParams {
  _requestId: string
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
      // Anthropic requires extendedthinking with increased budget
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
    // ping, message_start 等事件无需转发
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
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/ai-proxy.ts
git commit -m "feat(chat): add LLM API proxy service with SSE stream forwarding"
```

---

## Task 6: 主进程 — Chat IPC 处理器

**Files:**
- Create: `electron/ipc/chat.ts`
- Modify: `electron/ipc/index.ts` (注册新模块)
- Modify: `electron/main.ts` (注册新模块)

- [ ] **Step 1: 创建 `electron/ipc/chat.ts`**

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { proxyChatCompletions } from '../services/ai-proxy'
import type { ChatCompletionParams } from '../../src/types'

export function registerChatIpcHandlers(): void {
  ipcMain.handle('chat:completions', async (event, params: ChatCompletionParams & { _requestId: string }) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) {
      throw new Error('No main window found')
    }
    // 异步代理，不阻塞 IPC response
    proxyChatCompletions(mainWindow, params).catch((err) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('on:chat:error', {
          requestId: params._requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
    return { started: true }
  })
}
```

- [ ] **Step 2: 创建 `electron/ipc/ai-provider.ts`**

```typescript
import { ipcMain } from 'electron'
import {
  listAIProviders,
  createAIProvider,
  updateAIProvider,
  deleteAIProvider,
} from '../services/store'
import { testProviderConnection } from '../services/ai-proxy'

export function registerAIProviderIpcHandlers(): void {
  ipcMain.handle('ai-provider:list', () => {
    return listAIProviders()
  })

  ipcMain.handle('ai-provider:create', (_event, data) => {
    return createAIProvider(data)
  })

  ipcMain.handle('ai-provider:update', (_event, { id, ...updates }) => {
    return updateAIProvider(id, updates)
  })

  ipcMain.handle('ai-provider:delete', (_event, id: string) => {
    return deleteAIProvider(id)
  })

  ipcMain.handle('ai-provider:test', async (_event, id: string) => {
    return testProviderConnection(id)
  })
}
```

- [ ] **Step 3: 在 `electron/ipc/index.ts` 中注册新模块**

在文件顶部 import 区添加：

```typescript
import { registerChatIpcHandlers } from './chat'
import { registerAIProviderIpcHandlers } from './ai-provider'
```

在 `registerIpcHandlers()` 函数体内，在现有 `register*` 调用之后追加：

```typescript
registerChatIpcHandlers()
registerAIProviderIpcHandlers()
```

- [ ] **Step 4: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/chat.ts electron/ipc/ai-provider.ts electron/ipc/index.ts
git commit -m "feat(chat): add chat and AI provider IPC handlers"
```

---

## Task 7: 主进程 — 浏览器交互 IPC 处理器

**Files:**
- Modify: `electron/ipc/chat.ts` (添加浏览器交互通道)

浏览器交互工具通过 CDP (Chrome DevTools Protocol) 在主进程执行。复用 MCP CDP 工具的 `ensureDebuggerAttached` 模式。

- [ ] **Step 1: 在 `electron/ipc/chat.ts` 中添加浏览器交互 IPC**

在文件顶部添加 import：

```typescript
import { WebContentsView } from 'electron'
```

在 `registerChatIpcHandlers` 函数内追加：

```typescript
  // ===== 浏览器交互工具（CDP） =====
  ipcMain.handle('browser:click', async (_event, args: { selector?: string; x?: number; y?: number; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    if (args.selector) {
      await wc.executeJavaScript(`document.querySelector('${cssEscape(args.selector)}')?.click()`)
    } else if (args.x !== undefined && args.y !== undefined) {
      // CDP Input.dispatchMouseEvent 不在此实现，用 JS 模拟
      await wc.executeJavaScript(`
        const el = document.elementFromPoint(${args.x}, ${args.y})
        if (el) el.click()
      `)
    }
    return { success: true }
  })

  ipcMain.handle('browser:type', async (_event, args: { text: string; selector?: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    if (args.selector) {
      const escaped = args.text.replace(/'/g, "\\'")
      await wc.executeJavaScript(`
        const el = document.querySelector('${cssEscape(args.selector!)}')
        if (el) { el.focus(); el.value = '${escaped}'; el.dispatchEvent(new Event('input', { bubbles: true })) }
      `)
    } else {
      // 模拟键盘输入到当前焦点元素
      const escaped = args.text.replace(/'/g, "\\'")
      await wc.executeJavaScript(`
        const el = document.activeElement
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
          if (el.isContentEditable) { el.textContent += '${escaped}' }
          else { el.value += '${escaped}'; el.dispatchEvent(new Event('input', { bubbles: true })) }
        }
      `)
    }
    return { success: true }
  })

  ipcMain.handle('browser:scroll', async (_event, args: { direction: 'up' | 'down' | 'left' | 'right'; amount: number; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const scrollMap: Record<string, string> = {
      up: `window.scrollBy(0, -${args.amount})`,
      down: `window.scrollBy(0, ${args.amount})`,
      left: `window.scrollBy(-${args.amount}, 0)`,
      right: `window.scrollBy(${args.amount}, 0)`,
    }
    await wc.executeJavaScript(scrollMap[args.direction] ?? '')
    return { success: true }
  })

  ipcMain.handle('browser:select', async (_event, args: { selector: string; value: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const escapedValue = args.value.replace(/'/g, "\\'")
    await wc.executeJavaScript(`
      const el = document.querySelector('${cssEscape(args.selector)}')
      if (el) { el.value = '${escapedValue}'; el.dispatchEvent(new Event('change', { bubbles: true })) }
    `)
    return { success: true }
  })

  ipcMain.handle('browser:hover', async (_event, args: { selector: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    await wc.executeJavaScript(`
      const el = document.querySelector('${cssEscape(args.selector)}')
      if (el) { el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) }
    `)
    return { success: true }
  })

  ipcMain.handle('browser:get-content', async (_event, args: { tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const content = await wc.executeJavaScript('document.body.innerText')
    return { content }
  })

  ipcMain.handle('browser:get-dom', async (_event, args: { selector: string; tabId?: string }) => {
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const html = await wc.executeJavaScript(`
      const el = document.querySelector('${cssEscape(args.selector)}')
      el ? el.outerHTML : null
    `)
    return { html }
  })

  ipcMain.handle('browser:screenshot', async (_event, args: { tabId?: string; format?: string }) => {
    // 截图委托给 webview-manager 的 captureTab
    // 这里简化实现：直接通过 webContents capture
    const wc = getWebContents(args.tabId)
    if (!wc) return { error: 'Tab not found' }
    const image = await wc.capturePage()
    const base64 = image.toPNG().toString('base64')
    return { data: base64, format: 'png' }
  })
```

在文件底部（函数外）添加辅助函数：

```typescript
/** CSS 选择器中的特殊字符转义 */
function cssEscape(selector: string): string {
  return selector.replace(/'/g, "\\'")
}

/** 获取指定 tabId 的 webContents，无 tabId 时返回 null */
function getWebContents(tabId?: string): Electron.WebContents | null {
  if (!tabId) return null
  // 通过 webviewManager 获取 - 需要从 main 传入
  // 这里使用全局引用，在 main.ts 中设置
  const manager = (global as any).__webviewManager
  if (!manager) return null
  const view = manager.getTabView?.(tabId) as WebContentsView | undefined
  return view?.webContents ?? null
}
```

- [ ] **Step 2: 在 `electron/main.ts` 中设置 webviewManager 全局引用**

在 `createWindow()` 函数中，`webviewManager` 初始化之后添加：

```typescript
;(global as any).__webviewManager = webviewManager
```

- [ ] **Step 3: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/chat.ts electron/main.ts
git commit -m "feat(chat): add browser interaction IPC handlers (CDP-based click/type/scroll/select/hover/screenshot)"
```

---

## Task 8: Preload 桥接层

**Files:**
- Modify: `preload/index.ts`

在 `api` 对象中添加 `chat`、`aiProvider`、`browser` 三个命名空间。

- [ ] **Step 1: 在 `preload/index.ts` 中添加类型定义**

在文件顶部的类型定义区域（现有 interface 之后），追加：

```typescript
export interface ChatCompletionParams {
  providerId: string
  modelId: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
}
```

- [ ] **Step 2: 在 `api` 对象中添加 `chat` 命名空间**

在 `api` 对象的合适位置（如 `download` 之后），添加：

```typescript
  chat: {
    completions: (params: ChatCompletionParams & { _requestId: string }): Promise<{ started: boolean }> =>
      ipcRenderer.invoke('chat:completions', params),
  },
```

- [ ] **Step 3: 在 `api` 对象中添加 `aiProvider` 命名空间**

```typescript
  aiProvider: {
    list: (): Promise<any[]> => ipcRenderer.invoke('ai-provider:list'),
    create: (data: any): Promise<any> => ipcRenderer.invoke('ai-provider:create', data),
    update: (data: { id: string; [key: string]: any }): Promise<any> =>
      ipcRenderer.invoke('ai-provider:update', data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('ai-provider:delete', id),
    test: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ai-provider:test', id),
  },
```

- [ ] **Step 4: 在 `api` 对象中添加 `browser` 命名空间**

```typescript
  browser: {
    click: (args: any): Promise<any> => ipcRenderer.invoke('browser:click', args),
    type: (args: any): Promise<any> => ipcRenderer.invoke('browser:type', args),
    scroll: (args: any): Promise<any> => ipcRenderer.invoke('browser:scroll', args),
    select: (args: any): Promise<any> => ipcRenderer.invoke('browser:select', args),
    hover: (args: any): Promise<any> => ipcRenderer.invoke('browser:hover', args),
    getContent: (args: any): Promise<any> => ipcRenderer.invoke('browser:get-content', args),
    getDom: (args: any): Promise<any> => ipcRenderer.invoke('browser:get-dom', args),
    screenshot: (args: any): Promise<any> => ipcRenderer.invoke('browser:screenshot', args),
  },
```

- [ ] **Step 5: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add preload/index.ts
git commit -m "feat(chat): add chat/aiProvider/browser APIs to preload bridge"
```

---

## Task 9: 渲染进程 — AI Provider Store

**Files:**
- Create: `src/stores/ai-provider.ts`

- [ ] **Step 1: 创建 `src/stores/ai-provider.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProvider, AIModel } from '@/types'

const SELECTED_PROVIDER_KEY = 'sessionbox-selected-provider'
const SELECTED_MODEL_KEY = 'sessionbox-selected-model'

export const useAIProviderStore = defineStore('ai-provider', () => {
  const providers = ref<AIProvider[]>([])
  const selectedProviderId = ref<string | null>(localStorage.getItem(SELECTED_PROVIDER_KEY))
  const selectedModelId = ref<string | null>(localStorage.getItem(SELECTED_MODEL_KEY))

  const currentProvider = computed(() =>
    providers.value.find((p) => p.id === selectedProviderId.value) ?? null,
  )

  const currentModel = computed<AIModel | null>(() => {
    if (!currentProvider.value) return null
    return currentProvider.value.models.find((m) => m.id === selectedModelId.value) ?? null
  })

  const allModels = computed<{ model: AIModel; provider: AIProvider }[]>(() =>
    providers.value
      .filter((p) => p.enabled)
      .flatMap((p) => p.models.map((m) => ({ model: m, provider: p }))),
  )

  async function loadProviders() {
    providers.value = await window.api.aiProvider.list()
    // 自动选中第一个可用供应商和模型
    if (!selectedProviderId.value || !providers.value.find((p) => p.id === selectedProviderId.value)) {
      const first = providers.value.find((p) => p.enabled)
      if (first) {
        selectProvider(first.id)
      }
    }
  }

  function selectProvider(providerId: string) {
    selectedProviderId.value = providerId
    localStorage.setItem(SELECTED_PROVIDER_KEY, providerId)
    // 自动选中该供应商的第一个模型
    const provider = providers.value.find((p) => p.id === providerId)
    if (provider?.models.length) {
      selectModel(provider.models[0].id)
    } else {
      selectedModelId.value = null
      localStorage.removeItem(SELECTED_MODEL_KEY)
    }
  }

  function selectModel(modelId: string) {
    selectedModelId.value = modelId
    localStorage.setItem(SELECTED_MODEL_KEY, modelId)
  }

  async function createProvider(data: Omit<AIProvider, 'id' | 'createdAt'>) {
    const provider = await window.api.aiProvider.create(data)
    providers.value.push(provider)
    return provider
  }

  async function updateProvider(id: string, updates: Partial<AIProvider>) {
    const updated = await window.api.aiProvider.update({ id, ...updates })
    const index = providers.value.findIndex((p) => p.id === id)
    if (index !== -1) {
      providers.value[index] = updated
    }
    return updated
  }

  async function deleteProvider(id: string) {
    const success = await window.api.aiProvider.delete(id)
    if (success) {
      providers.value = providers.value.filter((p) => p.id !== id)
      if (selectedProviderId.value === id) {
        selectedProviderId.value = null
        selectedModelId.value = null
        localStorage.removeItem(SELECTED_PROVIDER_KEY)
        localStorage.removeItem(SELECTED_MODEL_KEY)
      }
    }
    return success
  }

  async function testConnection(id: string) {
    return window.api.aiProvider.test(id)
  }

  async function init() {
    await loadProviders()
  }

  return {
    providers,
    selectedProviderId,
    selectedModelId,
    currentProvider,
    currentModel,
    allModels,
    loadProviders,
    selectProvider,
    selectModel,
    createProvider,
    updateProvider,
    deleteProvider,
    testConnection,
    init,
  }
})
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/ai-provider.ts
git commit -m "feat(chat): add AI provider Pinia store with CRUD and model selection"
```

---

## Task 10: 渲染进程 — Chat Store

**Files:**
- Create: `src/stores/chat.ts`

这是聊天功能的核心 Store，管理会话列表、消息列表、流式状态、Agent 运行。

- [ ] **Step 1: 创建 `src/stores/chat.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatSession, ChatMessage, ToolCall } from '@/types'
import {
  createSession as dbCreateSession,
  listSessions as dbListSessions,
  deleteSession as dbDeleteSession,
  updateSessionTitle as dbUpdateSessionTitle,
  addMessage as dbAddMessage,
  listMessages as dbListMessages,
  updateMessage as dbUpdateMessage,
  clearMessages as dbClearMessages,
} from '@/lib/chat-db'
import { useAIProviderStore } from './ai-provider'
import { useTabStore } from './tab'
import { runAgentStream } from '@/lib/agent/agent'

const PANEL_VISIBLE_KEY = 'sessionbox-chat-panel-visible'
const TARGET_TAB_KEY = 'sessionbox-chat-target-tab'

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const isPanelVisible = ref(localStorage.getItem(PANEL_VISIBLE_KEY) === '1')
  const targetTabId = ref<string | null>(localStorage.getItem(TARGET_TAB_KEY))

  // 流式输出临时状态
  const streamingToken = ref('')
  const streamingToolCalls = ref<ToolCall[]>([])
  const streamingThinking = ref('')
  const abortController = ref<AbortController | null>(null)

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
  )

  // ===== 会话管理 =====

  async function loadSessions() {
    sessions.value = await dbListSessions()
  }

  async function createSession() {
    const providerStore = useAIProviderStore()
    if (!providerStore.currentProvider || !providerStore.currentModel) {
      throw new Error('请先选择 AI 模型')
    }
    const session = await dbCreateSession(
      providerStore.currentModel.id,
      providerStore.currentProvider.id,
      targetTabId.value,
    )
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    messages.value = []
    return session
  }

  async function deleteSessionById(id: string) {
    await dbDeleteSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentSessionId.value === id) {
      currentSessionId.value = null
      messages.value = []
    }
  }

  async function switchSession(id: string) {
    currentSessionId.value = id
    messages.value = await dbListMessages(id)
  }

  async function clearSessionMessages(id: string) {
    await dbClearMessages(id)
    if (currentSessionId.value === id) {
      messages.value = []
    }
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      session.messageCount = 0
    }
  }

  // ===== 消息发送 =====

  async function sendMessage(content: string, images?: string[]) {
    if (isStreaming.value) return
    if (!currentSessionId.value) {
      await createSession()
    }
    const sessionId = currentSessionId.value!
    const providerStore = useAIProviderStore()

    // 保存用户消息
    const userMsg = await dbAddMessage({
      sessionId,
      role: 'user',
      content,
      images,
      createdAt: Date.now(),
    })
    messages.value.push(userMsg)

    // 更新会话标题（首条消息时）
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session && session.messageCount <= 1) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
      await dbUpdateSessionTitle(sessionId, title)
      session.title = title
    }

    // 创建助手消息占位
    const assistantMsg = await dbAddMessage({
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelId: providerStore.currentModel?.id,
    })
    messages.value.push(assistantMsg)

    // 开始流式请求
    isStreaming.value = true
    streamingToken.value = ''
    streamingToolCalls.value = []
    streamingThinking.value = ''

    try {
      const controller = new AbortController()
      abortController.value = controller

      // 准备聊天历史（排除当前占位的 assistant 消息）
      const history = messages.value
        .filter((m) => m.id !== assistantMsg.id)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))

      await runAgentStream(
        history,
        content,
        images,
        {
          onToken: (token: string) => {
            streamingToken.value += token
          },
          onToolCall: (call: ToolCall) => {
            streamingToolCalls.value.push(call)
          },
          onToolResult: (_result: unknown) => {
            // 工具结果在 Agent 内部处理
          },
          onThinking: (thinkContent: string) => {
            streamingThinking.value += thinkContent
          },
          onDone: async () => {
            // 最终更新 assistant 消息
            const updates: Partial<ChatMessage> = {
              content: streamingToken.value,
              thinking: streamingThinking.value || undefined,
              toolCalls: streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined,
            }
            await dbUpdateMessage(assistantMsg.id, updates)
            const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
            if (msgIndex !== -1) {
              messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
            }
            isStreaming.value = false
            abortController.value = null
          },
          onError: async (error: Error) => {
            const updates: Partial<ChatMessage> = {
              content: streamingToken.value || `[错误] ${error.message}`,
            }
            await dbUpdateMessage(assistantMsg.id, updates)
            const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
            if (msgIndex !== -1) {
              messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates }
            }
            isStreaming.value = false
            abortController.value = null
          },
        },
        targetTabId.value,
      )
    } catch (error) {
      isStreaming.value = false
      abortController.value = null
      const msgIndex = messages.value.findIndex((m) => m.id === assistantMsg.id)
      if (msgIndex !== -1) {
        const errorContent = error instanceof Error ? error.message : String(error)
        messages.value[msgIndex] = { ...messages.value[msgIndex], content: `[错误] ${errorContent}` }
        await dbUpdateMessage(assistantMsg.id, { content: `[错误] ${errorContent}` })
      }
    }
  }

  function stopGeneration() {
    if (abortController.value) {
      abortController.value.abort()
      isStreaming.value = false
      abortController.value = null
    }
  }

  // ===== 面板控制 =====

  function togglePanel() {
    isPanelVisible.value = !isPanelVisible.value
    localStorage.setItem(PANEL_VISIBLE_KEY, isPanelVisible.value ? '1' : '0')
  }

  function setTargetTab(tabId: string | null) {
    targetTabId.value = tabId
    if (tabId) {
      localStorage.setItem(TARGET_TAB_KEY, tabId)
    } else {
      localStorage.removeItem(TARGET_TAB_KEY)
    }
  }

  // ===== 初始化 =====

  async function init() {
    await loadSessions()
    // 设置默认目标标签
    const tabStore = useTabStore()
    if (!targetTabId.value && tabStore.activeTabId) {
      setTargetTab(tabStore.activeTabId)
    }
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    isPanelVisible,
    targetTabId,
    streamingToken,
    streamingToolCalls,
    streamingThinking,
    currentSession,
    loadSessions,
    createSession,
    deleteSessionById,
    switchSession,
    clearSessionMessages,
    sendMessage,
    stopGeneration,
    togglePanel,
    setTargetTab,
    init,
  }
})
```

- [ ] **Step 2: 验证编译通过**

注意：此步骤依赖 Task 12（Agent 模块），如果在 Agent 模块之前编译会有 import 错误。可以先注释掉 `import { runAgentStream }` 和 `sendMessage` 中的调用，待 Task 12 完成后取消注释。

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/chat.ts
git commit -m "feat(chat): add Chat Pinia store with session management and streaming support"
```

---

## Task 11: Agent — 系统提示词

**Files:**
- Create: `src/lib/agent/system-prompt.ts`

- [ ] **Step 1: 创建 `src/lib/agent/system-prompt.ts`**

```typescript
export const BROWSER_AGENT_SYSTEM_PROMPT = `你是 SessionBox 浏览器的 AI 助手。你可以帮助用户操控浏览器标签页和页面内容。

能力：
- 管理标签页：创建、关闭、切换、导航
- 页面交互：点击元素、输入文字、滚动页面、选择下拉选项、悬停
- 信息获取：获取页面内容、DOM 结构、截图、查询标签详情
- 工作区管理：列出工作区、分组、容器、页面

规则：
- 操作前先确认目标标签页（用户可能指定 tabId，否则使用当前标签）
- 执行操作后报告结果
- 无法完成的操作要明确说明原因
- 对于破坏性操作（如关闭标签）要谨慎确认
- 页面交互时，优先使用 CSS 选择器定位元素
- 如果选择器不确定，先用 get_page_content 或 get_dom 获取页面结构
- 回复使用中文`
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/system-prompt.ts
git commit -m "feat(chat): add browser agent system prompt"
```

---

## Task 12: Agent — 工具注册

**Files:**
- Create: `src/lib/agent/tools.ts`

注册两类工具：复用现有 MCP 风格工具（走已有 IPC）和新增浏览器交互工具（走 browser IPC）。

- [ ] **Step 1: 创建 `src/lib/agent/tools.ts`**

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * 创建浏览器交互工具集（通过 IPC 桥接到主进程 CDP 执行）
 */
export function createBrowserTools(targetTabId: string | null): DynamicStructuredTool[] {
  const getTabId = (explicitTabId?: string) => explicitTabId ?? targetTabId ?? ''

  return [
    new DynamicStructuredTool({
      name: 'click_element',
      description: '点击页面上的元素。通过 CSS 选择器定位目标元素。',
      schema: z.object({
        selector: z.string().describe('CSS 选择器，例如 "#login-btn", ".submit-button", "a[href=\'/about\']"'),
        tabId: z.string().optional().describe('目标标签页 ID，不传则使用当前选中标签'),
      }),
      func: async (input) => {
        const result = await window.api.browser.click({
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'type_text',
      description: '在输入框中输入文字。可以通过选择器定位输入框，或直接输入到当前焦点元素。',
      schema: z.object({
        text: z.string().describe('要输入的文字'),
        selector: z.string().optional().describe('CSS 选择器定位输入框，不传则输入到当前焦点元素'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.type({
          text: input.text,
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'scroll_page',
      description: '滚动页面。',
      schema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']).describe('滚动方向'),
        amount: z.number().default(300).describe('滚动像素数'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.scroll({
          direction: input.direction,
          amount: input.amount,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'select_option',
      description: '选择下拉框的选项。',
      schema: z.object({
        selector: z.string().describe('select 元素的 CSS 选择器'),
        value: z.string().describe('要选中的选项值'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.select({
          selector: input.selector,
          value: input.value,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'hover_element',
      description: '鼠标悬停在元素上。',
      schema: z.object({
        selector: z.string().describe('CSS 选择器'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.hover({
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'get_page_content',
      description: '获取页面的文本内容。',
      schema: z.object({
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.getContent({
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'get_dom',
      description: '获取指定元素的 outerHTML。',
      schema: z.object({
        selector: z.string().describe('CSS 选择器'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.getDom({
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'get_page_screenshot',
      description: '截取页面截图。',
      schema: z.object({
        tabId: z.string().optional().describe('目标标签页 ID'),
        format: z.enum(['png', 'jpeg']).optional().describe('截图格式，默认 png'),
      }),
      func: async (input) => {
        const result = await window.api.browser.screenshot({
          tabId: getTabId(input.tabId),
          format: input.format,
        })
        return JSON.stringify(result)
      },
    }),

    // ===== 标签页管理工具（走现有 tab IPC） =====
    new DynamicStructuredTool({
      name: 'list_tabs',
      description: '列出所有打开的标签页。',
      schema: z.object({}),
      func: async () => {
        const tabs = await window.api.tab.list()
        return JSON.stringify(tabs)
      },
    }),

    new DynamicStructuredTool({
      name: 'create_tab',
      description: '创建新标签页。可提供 URL 直接打开。',
      schema: z.object({
        url: z.string().describe('要打开的 URL'),
        pageId: z.string().optional().describe('已有页面 ID'),
      }),
      func: async (input) => {
        if (input.pageId) {
          const tab = await window.api.tab.create(input.pageId)
          return JSON.stringify(tab)
        }
        // 无 pageId 时无法直接创建，返回提示
        return JSON.stringify({ error: '请提供 pageId（从 list_pages 获取）' })
      },
    }),

    new DynamicStructuredTool({
      name: 'navigate_tab',
      description: '在标签页中导航到指定 URL。',
      schema: z.object({
        url: z.string().describe('目标 URL'),
        tabId: z.string().optional().describe('标签页 ID'),
      }),
      func: async (input) => {
        const id = input.tabId ?? targetTabId ?? ''
        await window.api.tab.navigate(id, input.url)
        return JSON.stringify({ success: true })
      },
    }),

    new DynamicStructuredTool({
      name: 'switch_tab',
      description: '切换到指定标签页。',
      schema: z.object({
        tabId: z.string().describe('要切换到的标签页 ID'),
      }),
      func: async (input) => {
        await window.api.tab.switch(input.tabId)
        return JSON.stringify({ success: true })
      },
    }),

    new DynamicStructuredTool({
      name: 'close_tab',
      description: '关闭指定标签页。（破坏性操作，请谨慎使用）',
      schema: z.object({
        tabId: z.string().describe('要关闭的标签页 ID'),
      }),
      func: async (input) => {
        await window.api.tab.close(input.tabId)
        return JSON.stringify({ success: true })
      },
    }),

    new DynamicStructuredTool({
      name: 'list_groups',
      description: '列出所有分组。',
      schema: z.object({}),
      func: async () => {
        const groups = await window.api.group.list()
        return JSON.stringify(groups)
      },
    }),

    new DynamicStructuredTool({
      name: 'list_pages',
      description: '列出所有页面。',
      schema: z.object({}),
      func: async () => {
        const pages = await window.api.page.list()
        return JSON.stringify(pages)
      },
    }),
  ]
}
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat(chat): add browser interaction and tab management LangChain tools"
```

---

## Task 13: Agent — 流式处理与 Agent 初始化

**Files:**
- Create: `src/lib/agent/stream.ts`
- Create: `src/lib/agent/agent.ts`

- [ ] **Step 1: 创建 `src/lib/agent/stream.ts`**

处理通过 IPC 从主进程回传的 SSE 流事件，转换为 Agent 可用的回调。

```typescript
import type { ToolCall } from '@/types'

export interface StreamCallbacks {
  onToken: (token: string) => void
  onToolCall: (call: ToolCall) => void
  onToolResult: (result: unknown) => void
  onThinking: (content: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

/**
 * 监听主进程回传的聊天流事件。
 * 返回清理函数用于移除监听。
 */
export function listenToChatStream(requestId: string, callbacks: StreamCallbacks): () => void {
  const unsubscribers: Array<() => void> = []

  // 文本 chunk
  unsubscribers.push(
    window.api.on('chat:chunk', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onToken(data.token)
      }
    }),
  )

  // 工具调用
  unsubscribers.push(
    window.api.on('chat:tool-call', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onToolCall(data.toolCall)
      }
    }),
  )

  // 思考内容
  unsubscribers.push(
    window.api.on('chat:thinking', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onThinking(data.content)
      }
    }),
  )

  // 完成
  unsubscribers.push(
    window.api.on('chat:done', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onDone()
        // 自动清理
        unsubscribers.forEach((fn) => fn())
      }
    }),
  )

  // 错误
  unsubscribers.push(
    window.api.on('chat:error', (data: any) => {
      if (data.requestId === requestId) {
        callbacks.onError(new Error(data.error))
        unsubscribers.forEach((fn) => fn())
      }
    }),
  )

  return () => unsubscribers.forEach((fn) => fn())
}
```

- [ ] **Step 2: 创建 `src/lib/agent/agent.ts`**

```typescript
import type { ToolCall } from '@/types'
import { createBrowserTools } from './tools'
import { listenToChatStream, type StreamCallbacks } from './stream'
import { useAIProviderStore } from '@/stores/ai-provider'

/**
 * 通过主进程 API 代理运行 Agent 流式请求。
 * 渲染进程构造请求参数，主进程注入 API Key 并转发到 LLM 供应商。
 */
export async function runAgentStream(
  history: Array<{ role: string; content: string }>,
  input: string,
  images: string[] | undefined,
  callbacks: StreamCallbacks,
  targetTabId: string | null,
): Promise<void> {
  const providerStore = useAIProviderStore()
  const provider = providerStore.currentProvider
  const model = providerStore.currentModel

  if (!provider || !model) {
    callbacks.onError(new Error('请先配置 AI 供应商和模型'))
    return
  }

  // 构造消息（含图片支持）
  const userContent = images?.length
    ? [
        ...images.map((img) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/png' as const, data: img },
        })),
        { type: 'text' as const, text: input },
      ]
    : input

  const messages = [
    ...history.map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: userContent },
  ]

  // 构造工具定义（Anthropic 格式）
  const tools = createBrowserTools(targetTabId).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.schema,
  }))

  const requestId = crypto.randomUUID()

  // 监听流式回调
  const cleanup = listenToChatStream(requestId, callbacks)

  // 发送请求到主进程
  try {
    await window.api.chat.completions({
      _requestId: requestId,
      providerId: provider.id,
      modelId: model.id,
      messages,
      tools,
      stream: true,
      maxTokens: model.maxTokens || 4096,
      ...(model.supportsThinking ? { thinking: { type: 'enabled' as const, budgetTokens: 2000 } } : {}),
    })
  } catch (error) {
    cleanup()
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
```

- [ ] **Step 3: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/stream.ts src/lib/agent/agent.ts
git commit -m "feat(chat): add Agent stream processing and initialization"
```

---

## Task 14: UI — ThinkingBlock 组件

**Files:**
- Create: `src/components/chat/ThinkingBlock.vue`

- [ ] **Step 1: 创建 `src/components/chat/ThinkingBlock.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

defineProps<{
  content: string
}>()

const open = ref(false)
</script>

<template>
  <Collapsible v-model:open="open" class="my-1">
    <CollapsibleTrigger class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
      <svg
        class="w-3 h-3 transition-transform"
        :class="open ? 'rotate-90' : ''"
        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      💭 思考过程
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="mt-1 pl-4 text-xs text-muted-foreground border-l-2 border-muted whitespace-pre-wrap break-words">
        {{ content }}
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/ThinkingBlock.vue
git commit -m "feat(chat): add ThinkingBlock collapsible component"
```

---

## Task 15: UI — ToolCallCard 组件

**Files:**
- Create: `src/components/chat/ToolCallCard.vue`

- [ ] **Step 1: 创建 `src/components/chat/ToolCallCard.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { ToolCall } from '@/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const props = defineProps<{
  toolCall: ToolCall
}>()

const showResult = ref(false)

const statusConfig: Record<string, { label: string; class: string; icon: string }> = {
  pending: { label: '等待中', class: 'bg-muted text-muted-foreground', icon: '⏳' },
  running: { label: '执行中', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: '⚙️' },
  completed: { label: '完成', class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: '✅' },
  error: { label: '错误', class: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: '❌' },
}

const config = statusConfig[props.toolCall.status] ?? statusConfig.pending
</script>

<template>
  <div class="my-1 rounded-md border text-xs">
    <div class="flex items-center justify-between px-3 py-1.5">
      <span class="font-mono font-medium">{{ toolCall.name }}</span>
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" :class="config.class">
        {{ config.icon }} {{ config.label }}
      </span>
    </div>
    <div class="px-3 pb-1.5 text-muted-foreground">
      <div class="font-mono text-[11px] bg-muted/50 rounded px-2 py-1 overflow-x-auto">
        {{ JSON.stringify(toolCall.args, null, 2) }}
      </div>
    </div>
    <Collapsible v-if="toolCall.result != null || toolCall.error" v-model:open="showResult">
      <CollapsibleTrigger class="w-full px-3 pb-1 text-left text-muted-foreground hover:text-foreground cursor-pointer text-[11px]">
        {{ showResult ? '收起结果' : '查看结果' }}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div v-if="toolCall.error" class="px-3 pb-2 text-red-500 font-mono text-[11px]">{{ toolCall.error }}</div>
        <div v-else class="px-3 pb-2 font-mono text-[11px] bg-muted/50 rounded mx-3 mb-2 px-2 py-1 overflow-x-auto max-h-40">
          {{ typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2) }}
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/ToolCallCard.vue
git commit -m "feat(chat): add ToolCallCard status visualization component"
```

---

## Task 16: UI — ChatMessage 组件

**Files:**
- Create: `src/components/chat/ChatMessage.vue`

- [ ] **Step 1: 创建 `src/components/chat/ChatMessage.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage as ChatMessageType } from '@/types'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const props = defineProps<{
  message: ChatMessageType
  isStreaming?: boolean
  streamingContent?: string
  streamingThinking?: string
  streamingToolCalls?: ChatMessageType['toolCalls']
}>()

const displayContent = computed(() => {
  if (props.isStreaming && props.streamingContent !== undefined) return props.streamingContent
  return props.message.content
})

const displayThinking = computed(() => {
  if (props.isStreaming && props.streamingThinking !== undefined) return props.streamingThinking
  return props.message.thinking
})

const displayToolCalls = computed(() => {
  if (props.isStreaming && props.streamingToolCalls !== undefined) return props.streamingToolCalls
  return props.message.toolCalls
})

const isUser = computed(() => props.message.role === 'user')
</script>

<template>
  <div class="flex gap-3 py-3" :class="isUser ? 'flex-row-reverse' : ''">
    <!-- Avatar -->
    <Avatar class="h-7 w-7 shrink-0 mt-0.5">
      <AvatarFallback class="text-xs" :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'">
        {{ isUser ? '你' : 'AI' }}
      </AvatarFallback>
    </Avatar>

    <!-- 消息体 -->
    <div class="flex-1 min-w-0 space-y-1" :class="isUser ? 'text-right' : ''">
      <!-- 图片展示 -->
      <div v-if="message.images?.length" class="flex gap-2 flex-wrap" :class="isUser ? 'justify-end' : ''">
        <img
          v-for="(img, i) in message.images"
          :key="i"
          :src="`data:image/png;base64,${img}`"
          class="max-w-[200px] max-h-[200px] rounded-md border"
        />
      </div>

      <!-- 思考内容 -->
      <ThinkingBlock v-if="displayThinking" :content="displayThinking" />

      <!-- 文本内容 -->
      <div
        v-if="displayContent"
        class="inline-block rounded-lg px-3 py-2 text-sm leading-relaxed break-words max-w-[85%]"
        :class="isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'"
      >
        <div class="prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(displayContent)" />
      </div>

      <!-- 工具调用卡片 -->
      <div v-if="displayToolCalls?.length" class="space-y-1 max-w-[85%]">
        <ToolCallCard v-for="tc in displayToolCalls" :key="tc.id" :tool-call="tc" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// 配置 marked 高亮
marked.setOptions({
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
})

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}
</script>
```

注意：需要确保 `marked` 和 `highlight.js` 已在 Task 1 安装。

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatMessage.vue
git commit -m "feat(chat): add ChatMessage component with markdown, thinking, and tool call rendering"
```

---

## Task 17: UI — ChatInput 组件

**Files:**
- Create: `src/components/chat/ChatInput.vue`

- [ ] **Step 1: 创建 `src/components/chat/ChatInput.vue`**

```vue
<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { ImagePlus, Send, Square } from 'lucide-vue-next'

const props = defineProps<{
  isStreaming: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [content: string, images: string[]]
  stop: []
}>()

const inputText = ref('')
const images = ref<string[]>([])
const textareaRef = ref<HTMLTextAreaElement>()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.isStreaming) return
  emit('send', text, images.value)
  inputText.value = ''
  images.value = []
  nextTick(() => adjustHeight())
}

function handleImageUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      const base64 = await fileToBase64(file)
      images.value.push(base64)
    }
  }
  input.click()
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 去掉 data:image/...;base64, 前缀
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

function adjustHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function onInput() {
  adjustHeight()
}
</script>

<template>
  <div class="border-t p-3 space-y-2">
    <!-- 图片预览 -->
    <div v-if="images.length" class="flex gap-2 flex-wrap">
      <div v-for="(img, i) in images" :key="i" class="relative group">
        <img :src="`data:image/png;base64,${img}`" class="w-12 h-12 rounded border object-cover" />
        <button
          class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          @click="removeImage(i)"
        >
          ×
        </button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="flex items-end gap-2">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        :disabled="disabled"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        class="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[200px]"
        rows="1"
        @keydown="handleKeydown"
        @input="onInput"
      />

      <!-- 图片上传 -->
      <Button variant="ghost" size="icon" class="shrink-0 h-8 w-8" :disabled="isStreaming" @click="handleImageUpload">
        <ImagePlus class="h-4 w-4" />
      </Button>

      <!-- 发送/停止按钮 -->
      <Button
        v-if="isStreaming"
        variant="destructive"
        size="icon"
        class="shrink-0 h-8 w-8"
        @click="$emit('stop')"
      >
        <Square class="h-3 w-3" />
      </Button>
      <Button
        v-else
        size="icon"
        class="shrink-0 h-8 w-8"
        :disabled="!inputText.trim() || disabled"
        @click="handleSend"
      >
        <Send class="h-4 w-4" />
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatInput.vue
git commit -m "feat(chat): add ChatInput component with image upload and send/stop controls"
```

---

## Task 18: UI — ChatMessageList 组件

**Files:**
- Create: `src/components/chat/ChatMessageList.vue`

- [ ] **Step 1: 创建 `src/components/chat/ChatMessageList.vue`**

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ChatMessage, ToolCall } from '@/types'
import ChatMessage from './ChatMessage.vue'

const props = defineProps<{
  messages: ChatMessage[]
  isStreaming: boolean
  streamingToken: string
  streamingToolCalls: ToolCall[]
  streamingThinking: string
}>()

const containerRef = ref<HTMLDivElement>()
const autoScroll = ref(true)

// 消息变化时自动滚动到底部
watch(
  () => [props.messages.length, props.streamingToken, props.streamingThinking],
  () => {
    if (autoScroll.value) {
      nextTick(() => scrollToBottom())
    }
  },
)

function scrollToBottom() {
  const el = containerRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

function handleScroll() {
  const el = containerRef.value
  if (!el) return
  // 如果用户手动向上滚动，禁用自动滚动
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 50
}
</script>

<template>
  <div ref="containerRef" class="flex-1 overflow-y-auto px-4" @scroll="handleScroll">
    <!-- 无消息时的空状态 -->
    <div v-if="!messages.length && !isStreaming" class="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <svg class="w-10 h-10 opacity-40" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p class="text-sm">开始新的对话</p>
    </div>

    <!-- 消息列表 -->
    <ChatMessage
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
    />

    <!-- 流式输出中的最后一条 assistant 消息 -->
    <ChatMessage
      v-if="isStreaming && messages.length > 0"
      :message="messages[messages.length - 1]"
      :is-streaming="true"
      :streaming-content="streamingToken"
      :streaming-thinking="streamingThinking"
      :streaming-tool-calls="streamingToolCalls"
    />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/ChatMessageList.vue
git commit -m "feat(chat): add ChatMessageList with auto-scroll and streaming support"
```

---

## Task 19: UI — ModelSelector 组件

**Files:**
- Create: `src/components/chat/ModelSelector.vue`

- [ ] **Step 1: 创建 `src/components/chat/ModelSelector.vue`**

```vue
<script setup lang="ts">
import { useAIProviderStore } from '@/stores/ai-provider'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const providerStore = useAIProviderStore()

function handleModelChange(value: string) {
  // value 格式: "providerId:modelId"
  const [providerId, modelId] = value.split(':')
  if (providerId && modelId) {
    providerStore.selectProvider(providerId)
    providerStore.selectModel(modelId)
  }
}

function getCurrentValue(): string {
  if (providerStore.selectedProviderId && providerStore.selectedModelId) {
    return `${providerStore.selectedProviderId}:${providerStore.selectedModelId}`
  }
  return ''
}
</script>

<template>
  <Select :model-value="getCurrentValue()" @update:model-value="handleModelChange">
    <SelectTrigger class="h-7 text-xs w-[180px]">
      <SelectValue placeholder="选择模型" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup v-for="provider in providerStore.providers.filter(p => p.enabled)" :key="provider.id">
        <SelectLabel>{{ provider.name }}</SelectLabel>
        <SelectItem
          v-for="model in provider.models"
          :key="model.id"
          :value="`${provider.id}:${model.id}`"
          class="text-xs"
        >
          {{ model.name }}
          <span v-if="model.supportsVision" class="text-muted-foreground ml-1">📷</span>
          <span v-if="model.supportsThinking" class="text-muted-foreground ml-1">💭</span>
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/ModelSelector.vue
git commit -m "feat(chat): add ModelSelector dropdown component"
```

---

## Task 20: UI — BrowserViewPicker 组件

**Files:**
- Create: `src/components/chat/BrowserViewPicker.vue`

- [ ] **Step 1: 创建 `src/components/chat/BrowserViewPicker.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useTabStore } from '@/stores/tab'
import { useChatStore } from '@/stores/chat'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const tabStore = useTabStore()
const chatStore = useChatStore()

const tabs = computed(() => tabStore.tabs)

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
</script>

<template>
  <Select
    :model-value="chatStore.targetTabId ?? ''"
    @update:model-value="chatStore.setTargetTab($event || null)"
  >
    <SelectTrigger class="h-7 text-xs w-[160px]">
      <SelectValue placeholder="选择标签页" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="" class="text-xs">自动检测</SelectItem>
      <SelectItem
        v-for="tab in tabs"
        :key="tab.id"
        :value="tab.id"
        class="text-xs"
      >
        <span class="truncate">{{ tab.title || getDomain(tab.url) }}</span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/BrowserViewPicker.vue
git commit -m "feat(chat): add BrowserViewPicker target tab selector"
```

---

## Task 21: UI — SessionManager 组件

**Files:**
- Create: `src/components/chat/SessionManager.vue`

- [ ] **Step 1: 创建 `src/components/chat/SessionManager.vue`**

```vue
<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MessageSquarePlus, Trash2, History } from 'lucide-vue-next'

const chatStore = useChatStore()

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString()
}

async function handleNewSession() {
  await chatStore.createSession()
}

async function handleDeleteSession(id: string) {
  await chatStore.deleteSessionById(id)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="h-7 w-7">
        <History class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-[260px]">
      <DropdownMenuItem @click="handleNewSession">
        <MessageSquarePlus class="h-4 w-4 mr-2" />
        新建对话
      </DropdownMenuItem>
      <DropdownMenuSeparator v-if="chatStore.sessions.length" />
      <DropdownMenuItem
        v-for="session in chatStore.sessions.slice(0, 20)"
        :key="session.id"
        class="flex items-center justify-between cursor-pointer"
        :class="session.id === chatStore.currentSessionId ? 'bg-accent' : ''"
        @click="chatStore.switchSession(session.id)"
      >
        <div class="flex-1 min-w-0">
          <div class="text-sm truncate">{{ session.title }}</div>
          <div class="text-[10px] text-muted-foreground">{{ formatTime(session.updatedAt) }}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
          @click.stop="handleDeleteSession(session.id)"
        >
          <Trash2 class="h-3 w-3 text-destructive" />
        </Button>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/SessionManager.vue
git commit -m "feat(chat): add SessionManager dropdown component"
```

---

## Task 22: UI — ProviderManager 组件

**Files:**
- Create: `src/components/chat/ProviderManager.vue`

这是一个供应商管理对话框，用于添加/编辑/删除 AI 供应商和模型。

- [ ] **Step 1: 创建 `src/components/chat/ProviderManager.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAIProviderStore } from '@/stores/ai-provider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Plus, Trash2, TestTube2, ChevronDown, Loader2 } from 'lucide-vue-next'
import type { AIProvider, AIModel } from '@/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const providerStore = useAIProviderStore()
const expandedProviderId = ref<string | null>(null)
const testing = ref(false)
const testResult = ref<{ success: boolean; error?: string } | null>(null)

// 新增供应商表单
const showAddProvider = ref(false)
const newProviderName = ref('')
const newProviderApiBase = ref('https://api.anthropic.com')
const newProviderApiKey = ref('')

// 新增模型表单
const addingModelForProvider = ref<string | null>(null)
const newModelId = ref('')
const newModelName = ref('')
const newModelMaxTokens = ref(4096)
const newModelSupportsVision = ref(false)
const newModelSupportsThinking = ref(false)

async function handleAddProvider() {
  if (!newProviderName.value.trim() || !newProviderApiKey.value.trim()) return
  await providerStore.createProvider({
    name: newProviderName.value.trim(),
    apiBase: newProviderApiBase.value.trim(),
    apiKey: newProviderApiKey.value.trim(),
    models: [],
    enabled: true,
  })
  newProviderName.value = ''
  newProviderApiBase.value = 'https://api.anthropic.com'
  newProviderApiKey.value = ''
  showAddProvider.value = false
}

async function handleDeleteProvider(id: string) {
  await providerStore.deleteProvider(id)
}

async function handleTestConnection(id: string) {
  testing.value = true
  testResult.value = null
  testResult.value = await providerStore.testConnection(id)
  testing.value = false
}

async function handleAddModel(providerId: string) {
  if (!newModelId.value.trim()) return
  const provider = providerStore.providers.find((p) => p.id === providerId)
  if (!provider) return

  const newModel: AIModel = {
    id: newModelId.value.trim(),
    name: newModelName.value.trim() || newModelId.value.trim(),
    providerId,
    maxTokens: newModelMaxTokens.value,
    supportsVision: newModelSupportsVision.value,
    supportsThinking: newModelSupportsThinking.value,
  }

  await providerStore.updateProvider(providerId, {
    models: [...provider.models, newModel],
  })

  newModelId.value = ''
  newModelName.value = ''
  newModelMaxTokens.value = 4096
  newModelSupportsVision.value = false
  newModelSupportsThinking.value = false
  addingModelForProvider.value = null
}

async function handleDeleteModel(providerId: string, modelId: string) {
  const provider = providerStore.providers.find((p) => p.id === providerId)
  if (!provider) return
  await providerStore.updateProvider(providerId, {
    models: provider.models.filter((m) => m.id !== modelId),
  })
}

async function handleToggleProvider(provider: AIProvider) {
  await providerStore.updateProvider(provider.id, { enabled: !provider.enabled })
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-lg max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>管理 AI 供应商</DialogTitle>
      </DialogHeader>

      <div class="space-y-3">
        <!-- 供应商列表 -->
        <div v-for="provider in providerStore.providers" :key="provider.id" class="border rounded-lg">
          <Collapsible v-model:open="expandedProviderId === provider.id" @update:open="expandedProviderId = $event ? provider.id : null">
            <div class="flex items-center justify-between px-3 py-2">
              <div class="flex items-center gap-2">
                <CollapsibleTrigger class="cursor-pointer">
                  <ChevronDown class="h-4 w-4 transition-transform" :class="expandedProviderId === provider.id ? '' : '-rotate-90'" />
                </CollapsibleTrigger>
                <span class="text-sm font-medium">{{ provider.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <Switch :checked="provider.enabled" @update:checked="handleToggleProvider(provider)" />
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="handleTestConnection(provider.id)">
                  <Loader2 v-if="testing" class="h-3 w-3 animate-spin" />
                  <TestTube2 v-else class="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="handleDeleteProvider(provider.id)">
                  <Trash2 class="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            <CollapsibleContent>
              <div class="px-3 pb-2 space-y-1 text-xs text-muted-foreground">
                <div>API Base: {{ provider.apiBase }}</div>
                <div>模型数量: {{ provider.models.length }}</div>
              </div>
              <!-- 模型列表 -->
              <div class="px-3 pb-2 space-y-1">
                <div v-for="model in provider.models" :key="model.id" class="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                  <span>{{ model.name }} <span class="text-muted-foreground">({{ model.maxTokens }} tokens)</span></span>
                  <Button variant="ghost" size="icon" class="h-5 w-5" @click="handleDeleteModel(provider.id, model.id)">
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
                <!-- 添加模型 -->
                <div v-if="addingModelForProvider === provider.id" class="space-y-1.5 pt-1">
                  <Input v-model="newModelId" placeholder="模型 ID (如 claude-sonnet-4-6)" class="h-7 text-xs" />
                  <Input v-model="newModelName" placeholder="显示名称" class="h-7 text-xs" />
                  <Input v-model.number="newModelMaxTokens" type="number" placeholder="maxTokens" class="h-7 text-xs" />
                  <div class="flex items-center gap-3 text-xs">
                    <label class="flex items-center gap-1"><Switch v-model:checked="newModelSupportsVision" class="scale-75" /> 视觉</label>
                    <label class="flex items-center gap-1"><Switch v-model:checked="newModelSupportsThinking" class="scale-75" /> 思考</label>
                  </div>
                  <div class="flex gap-1">
                    <Button size="sm" class="h-6 text-xs" @click="handleAddModel(provider.id)">添加</Button>
                    <Button size="sm" variant="ghost" class="h-6 text-xs" @click="addingModelForProvider = null">取消</Button>
                  </div>
                </div>
                <Button v-else variant="ghost" size="sm" class="h-6 text-xs" @click="addingModelForProvider = provider.id">
                  <Plus class="h-3 w-3 mr-1" /> 添加模型
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <!-- 测试结果 -->
        <div v-if="testResult" class="text-xs rounded px-2 py-1" :class="testResult.success ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'">
          {{ testResult.success ? '连接成功' : `连接失败: ${testResult.error}` }}
        </div>

        <!-- 添加供应商 -->
        <div v-if="showAddProvider" class="border rounded-lg p-3 space-y-2">
          <Input v-model="newProviderName" placeholder="供应商名称 (如 Anthropic)" class="h-7 text-xs" />
          <Input v-model="newProviderApiBase" placeholder="API Base URL" class="h-7 text-xs" />
          <Input v-model="newProviderApiKey" type="password" placeholder="API Key" class="h-7 text-xs" />
          <div class="flex gap-1">
            <Button size="sm" class="h-7 text-xs" @click="handleAddProvider">添加</Button>
            <Button size="sm" variant="ghost" class="h-7 text-xs" @click="showAddProvider = false">取消</Button>
          </div>
        </div>
        <Button v-else variant="outline" size="sm" class="w-full text-xs" @click="showAddProvider = true">
          <Plus class="h-3 w-3 mr-1" /> 添加供应商
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ProviderManager.vue
git commit -m "feat(chat): add ProviderManager dialog for AI provider CRUD"
```

---

## Task 23: UI — ChatPanel 主容器

**Files:**
- Create: `src/components/chat/ChatPanel.vue`

ChatPanel 组合所有子组件，是聊天侧边栏的完整实现。

- [ ] **Step 1: 创建 `src/components/chat/ChatPanel.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ModelSelector from './ModelSelector.vue'
import BrowserViewPicker from './BrowserViewPicker.vue'
import SessionManager from './SessionManager.vue'
import ProviderManager from './ProviderManager.vue'
import { Button } from '@/components/ui/button'
import { Settings, X } from 'lucide-vue-next'

const chatStore = useChatStore()
const providerStore = useAIProviderStore()
const showProviderManager = ref(false)

function handleSend(content: string, images: string[]) {
  chatStore.sendMessage(content, images.length > 0 ? images : undefined)
}

function handleClose() {
  chatStore.togglePanel()
}
</script>

<template>
  <div class="flex flex-col h-full bg-background border-l border-border">
    <!-- 头部工具栏 -->
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
      <BrowserViewPicker />
      <ModelSelector />
      <SessionManager />
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="showProviderManager = true">
        <Settings class="h-4 w-4" />
      </Button>
      <div class="flex-1" />
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleClose">
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- 消息列表 -->
    <ChatMessageList
      :messages="chatStore.messages"
      :is-streaming="chatStore.isStreaming"
      :streaming-token="chatStore.streamingToken"
      :streaming-tool-calls="chatStore.streamingToolCalls"
      :streaming-thinking="chatStore.streamingThinking"
    />

    <!-- 输入区域 -->
    <ChatInput
      :is-streaming="chatStore.isStreaming"
      :disabled="!providerStore.currentModel"
      @send="handleSend"
      @stop="chatStore.stopGeneration()"
    />

    <!-- 供应商管理对话框 -->
    <ProviderManager v-model:open="showProviderManager" />
  </div>
</template>
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatPanel.vue
git commit -m "feat(chat): add ChatPanel main container composing all sub-components"
```

---

## Task 24: 布局集成 — App.vue 四面板

**Files:**
- Modify: `src/App.vue`

将 ChatPanel 作为第四个 ResizablePanel 插入到主内容区与 RightPanel 之间。

- [ ] **Step 1: 在 `src/App.vue` 顶部添加 import**

在现有 import 区域追加：

```typescript
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { useChatStore } from '@/stores/chat'
import { useAIProviderStore } from '@/stores/ai-provider'
```

- [ ] **Step 2: 在 setup 区域添加 store 初始化**

在现有 store 初始化区域（如 `const mcpStore = useMcpStore()` 之后）添加：

```typescript
const chatStore = useChatStore()
const aiProviderStore = useAIProviderStore()
```

在 `onMounted` 中，与其他 store 初始化并行，添加：

```typescript
void chatStore.init()
void aiProviderStore.init()
```

- [ ] **Step 3: 修改模板中的布局**

找到模板中 `</ResizablePanel>` 闭合标签和 `<!-- 右侧面板（固定 50px） -->` 注释之间的位置（大约在 App.vue 第 710 行附近）。

在主内容区 `</ResizablePanel>` 之后、RightPanel `<div>` 之前，插入 ChatPanel：

```vue
        <!-- 聊天面板（可调整宽度，默认 380px） -->
        <template v-if="chatStore.isPanelVisible">
          <ResizableHandle />
          <ResizablePanel size-unit="px" :default-size="380" :min-size="280" :max-size="600">
            <ChatPanel />
          </ResizablePanel>
        </template>
```

完整结构变为：

```vue
        <!-- 主内容区面板 -->
        </template>
        <ResizablePanel>
          <!-- ... 主内容区不变 ... -->
        </ResizablePanel>

        <!-- 聊天面板 -->
        <template v-if="chatStore.isPanelVisible">
          <ResizableHandle />
          <ResizablePanel size-unit="px" :default-size="380" :min-size="280" :max-size="600">
            <ChatPanel />
          </ResizablePanel>
        </template>

        <!-- 右侧面板（固定 50px） -->
        <div v-if="!immersiveMode" class="w-[50px] shrink-0 h-full border-l border-border">
          <RightPanel ... />
        </div>
```

- [ ] **Step 4: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 5: 手动测试**

启动 `pnpm dev`，验证：
1. 应用正常启动，布局不变（ChatPanel 默认隐藏）
2. 在 DevTools 控制台执行 `window.__VUE_DEVTOOLS_GLOBAL_HOOK__.stores.chatStore.togglePanel()` 或通过代码调用 `chatStore.togglePanel()` 显示聊天面板
3. 聊天面板正确显示在主内容区和右侧面板之间
4. 面板可拖拽调整宽度

- [ ] **Step 6: Commit**

```bash
git add src/App.vue
git commit -m "feat(chat): integrate ChatPanel into four-panel layout"
```

---

## Task 25: 入口快捷操作

**Files:**
- Modify: `src/components/common/RightPanel.vue` (添加聊天按钮)
- Modify: `src/components/toolbar/BrowserToolbar.vue` (添加聊天切换按钮)

为用户提供打开 ChatPanel 的入口。

- [ ] **Step 1: 在 RightPanel 中添加聊天按钮**

在 `src/components/common/RightPanel.vue` 的顶部按钮区域，添加一个聊天图标按钮。

在合适的位置（如现有按钮之后）添加：

```vue
<Popover>
  <PopoverTrigger as-child>
    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      @click="chatStore.togglePanel()"
    >
      <MessageSquare class="h-4 w-4" />
    </Button>
  </PopoverTrigger>
</Popover>
```

在 `<script setup>` 中添加：

```typescript
import { useChatStore } from '@/stores/chat'
import { MessageSquare } from 'lucide-vue-next'

const chatStore = useChatStore()
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

- [ ] **Step 3: 手动测试**

启动 `pnpm dev`，验证：
1. RightPanel 出现聊天图标按钮
2. 点击按钮可切换 ChatPanel 显示/隐藏
3. ChatPanel 首次显示时，可选择供应商/模型、新建对话、发送消息

- [ ] **Step 4: Commit**

```bash
git add src/components/common/RightPanel.vue
git commit -m "feat(chat): add chat toggle button to RightPanel"
```

---

## 自我审查清单

### 1. 规格覆盖

| 规格要求 | 对应 Task |
|---------|----------|
| Dexie 聊天数据库 | Task 3 |
| ChatSession/ChatMessage 数据模型 | Task 2 + Task 3 |
| ToolCall 数据模型 | Task 2 |
| AIProvider/AIModel 数据模型 | Task 2 + Task 4 |
| 供应商管理 IPC | Task 6 |
| Chat completions IPC (流式) | Task 5 + Task 6 |
| 浏览器交互 IPC (CDP) | Task 7 |
| API Key 安全存储 | Task 4 + Task 5 |
| Preload API 暴露 | Task 8 |
| AI Provider Store | Task 9 |
| Chat Store | Task 10 |
| LangChain Agent | Task 12 + Task 13 |
| 流式处理 | Task 13 |
| 工具注册 (MCP + 浏览器交互) | Task 12 |
| ChatPanel 四面板布局 | Task 24 |
| ChatMessageList | Task 18 |
| ChatInput (图片上传) | Task 17 |
| ChatMessage (markdown) | Task 16 |
| ToolCallCard | Task 15 |
| ThinkingBlock | Task 14 |
| SessionManager | Task 21 |
| ModelSelector | Task 19 |
| BrowserViewPicker | Task 20 |
| ProviderManager | Task 22 |
| 系统提示词 | Task 11 |
| 依赖安装 | Task 1 |
| 快捷入口 | Task 25 |

### 2. 占位符扫描

无 TBD、TODO、"implement later"、"add appropriate error handling" 等占位符。所有步骤包含完整代码。

### 3. 类型一致性

- `ChatSession` / `ChatMessage` / `ToolCall` / `AIProvider` / `AIModel` 在 `src/types/index.ts` 定义，被 `chat-db.ts`、`stores/chat.ts`、`stores/ai-provider.ts`、组件引用
- 主进程使用 `AIProviderStore` / `AIModelStore` 独立定义，避免跨进程导入
- IPC 通道命名一致：`chat:completions`、`ai-provider:list` 等
- Preload API 命名与 IPC 通道一致
- 浏览器交互工具参数类型 `BrowserClickArgs` 等在 types 中定义

### 潜在风险

1. **Zod 版本兼容性**：项目使用 zod ^4.3.6，LangChain `DynamicStructuredTool` 可能依赖 zod v3。如遇兼容问题，需降级 zod 或使用 LangChain 兼容的 schema 方式。
2. **SSE 解析**：`ai-proxy.ts` 使用 Node.js `fetch` + `ReadableStream`。在 Electron 35+ 中 Node.js fetch 应可用，但需验证 SSE 解析逻辑与实际 Anthropic API 响应格式匹配。
3. **WebContentsView 获取**：`browser:*` IPC 处理器通过 `global.__webviewManager` 获取 WebContentsView。需确认 `webviewManager.getTabView(tabId)` 方法存在且返回 `WebContentsView`。
