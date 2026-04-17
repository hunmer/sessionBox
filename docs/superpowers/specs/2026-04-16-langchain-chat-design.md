# SessionBox LangChain Chat 设计规格

## 概述

为 SessionBox 添加基于 LangChain.js 的 AI 聊天界面，允许用户通过自然语言操控浏览器标签页和页面内容。采用渲染进程运行 Agent、主进程代理 API 请求的架构，使用 shadcn-vue 构建四面板布局中的聊天侧边栏。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Agent 运行位置 | 渲染进程 | 工具调用零延迟，直接走 IPC；UI 与 Agent 同进程，流式渲染无序列化开销 |
| 聊天数据存储 | Dexie (IndexedDB) | 支持大量数据、会话搜索，复用项目已有 Dexie 经验 |
| API Key 存储 | 主进程 electron-store | 加密存储，渲染进程无法通过 DevTools 查看 |
| 模型 API 调用 | 主进程代理转发 | API Key 安全，支持多供应商统一代理 |
| 工具范围 | MCP 工具 + 浏览器交互 | 复用现有 MCP 工具 + 新增 CDP 页面交互（点击、输入、滚动） |
| 布局方式 | 四面板布局 | 聊天面板作为 ResizablePanel 插入内容区与 RightPanel 之间 |
| 工具调用方式 | IPC 直调 | 内部工具走 IPC 即可，无需经过 MCP Server |
| 模型 SDK | @langchain/anthropic | 支持 Anthropic 格式，兼容 extended thinking |

## 文件结构

```
src/
  components/chat/
    ChatPanel.vue            ← 聊天面板主容器（四面板第三个面板）
    ChatMessageList.vue      ← 消息列表（支持流式渲染）
    ChatInput.vue            ← 输入框（支持图片上传、发送）
    ChatMessage.vue          ← 单条消息（markdown 渲染）
    ToolCallCard.vue         ← 工具调用可视化卡片
    ThinkingBlock.vue        ← 思考内容折叠展示
    SessionManager.vue       ← 会话管理（新建/删除/切换）
    ModelSelector.vue        ← 模型/供应商选择器
    BrowserViewPicker.vue    ← 目标浏览器视图选择器
    ProviderManager.vue      ← 供应商管理对话框
  stores/
    chat.ts                  ← 聊天 Pinia Store
    ai-provider.ts           ← 供应商/模型配置 Store
  lib/
    chat-db.ts               ← Dexie 数据库定义（会话+消息）
    agent/
      agent.ts               ← LangChain Agent 初始化与运行
      tools.ts               ← 浏览器交互工具注册（IPC 调用）
      stream.ts              ← 流式输出处理

electron/
  ipc/
    chat.ts                  ← 聊天 IPC（API 代理）
    ai-provider.ts           ← 供应商管理 IPC
  services/
    ai-proxy.ts              ← LLM API 代理服务

preload/
  index.ts                   ← 新增 chat / aiProvider / browser API
```

## 数据模型

### Dexie 数据库：sessionbox-chat

```typescript
interface ChatSession {
  id: string
  title: string               // 首条消息自动生成
  browserViewId: string | null // 关联的浏览器视图 ID
  modelId: string
  providerId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string             // markdown
  toolCalls?: ToolCall[]
  toolResult?: any
  thinking?: string           // extended thinking
  images?: string[]           // base64 图片（user 消息）
  modelId?: string
  createdAt: number
}

interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: any
  error?: string
  startedAt?: number
  completedAt?: number
}
```

Dexie 索引：

```typescript
this.version(1).stores({
  sessions: 'id, updatedAt, createdAt',
  messages: 'id, sessionId, createdAt, [sessionId+createdAt]',
})
```

### 供应商/模型配置（electron-store）

```typescript
interface AIProvider {
  id: string
  name: string                // "Anthropic", "OpenAI", "自定义"
  apiBase: string
  apiKey: string              // 加密存储
  models: AIModel[]
  enabled: boolean
  createdAt: number
}

interface AIModel {
  id: string                  // "claude-sonnet-4-6"
  name: string                // 显示名称
  providerId: string
  maxTokens: number
  supportsVision: boolean
  supportsThinking: boolean
}
```

## IPC 通道设计

### 模型 API 代理

| 通道 | 方向 | 说明 |
|------|------|------|
| `chat:completions` | 渲染→主 | 发送聊天请求（流式） |
| `on:chat:chunk` | 主→渲染 | 流式文本 chunk |
| `on:chat:tool-call` | 主→渲染 | 工具调用事件 |
| `on:chat:thinking` | 主→渲染 | 思考内容 |
| `on:chat:done` | 主→渲染 | 完成信号 |
| `on:chat:error` | 主→渲染 | 错误 |

`chat:completions` 入参：

```typescript
{
  providerId: string
  modelId: string
  messages: AnthropicMessage[]
  tools?: ToolDefinition[]
  stream: true
  maxTokens?: number
  thinking?: { type: 'enabled', budgetTokens: number }
}
```

### 供应商管理

| 通道 | 说明 |
|------|------|
| `ai-provider:list` | 列出所有供应商 |
| `ai-provider:create` | 创建供应商 |
| `ai-provider:update` | 更新供应商 |
| `ai-provider:delete` | 删除供应商 |
| `ai-provider:test` | 测试连接 |

### 浏览器交互工具

| 通道 | 入参 | 说明 |
|------|------|------|
| `browser:click` | `{ x, y, tabId? }` | 点击 |
| `browser:type` | `{ text, selector?, tabId? }` | 输入文字 |
| `browser:scroll` | `{ direction, amount, tabId? }` | 滚动 |
| `browser:select` | `{ selector, value, tabId? }` | 选择 |
| `browser:hover` | `{ selector, tabId? }` | 悬停 |
| `browser:get-content` | `{ tabId? }` | 获取页面内容 |
| `browser:get-dom` | `{ selector, tabId? }` | 获取 DOM |
| `browser:screenshot` | `{ tabId?, format? }` | 截图 |

## LangChain Agent 架构

### Agent 初始化

```typescript
import { ChatAnthropic } from '@langchain/anthropic'
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents'
import { ChatPromptTemplate } from '@langchain/core/prompts'

export function createBrowserAgent(model: ChatAnthropic, tools: DynamicStructuredTool[]) {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', BROWSER_AGENT_SYSTEM_PROMPT],
    ['placeholder', '{chat_history}'],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ])

  const agent = createToolCallingAgent({ llm: model, tools, prompt })
  return new AgentExecutor({ agent, tools, maxIterations: 15 })
}
```

### 工具注册

两类工具，均通过 IPC 桥接：

**复用现有 MCP 工具**（直接走现有 IPC）：
- `list_tabs`, `list_groups`, `list_containers`, `list_pages`, `list_workspaces`
- `create_tab`, `navigate_tab`, `close_tab`, `switch_tab`, `reload_tab`
- `get_tab_detail`

**新增浏览器交互工具**（走主进程 CDP 执行）：
- `click_element`, `input_text`, `scroll_page`, `select_option`, `hover_element`
- `get_page_content`, `get_dom`, `get_page_screenshot`

注册模式：

```typescript
new DynamicStructuredTool({
  name: 'click_element',
  description: '点击页面元素',
  schema: z.object({
    selector: z.string().describe('CSS 选择器'),
    tabId: z.string().optional(),
  }),
  func: async (input) => window.api.browser.click(input),
})
```

### 流式处理

```typescript
export async function runAgentStream(
  executor: AgentExecutor,
  input: string,
  chatHistory: BaseMessage[],
  callbacks: {
    onToken: (token: string) => void
    onToolCall: (call: ToolCall) => void
    onToolResult: (result: any) => void
    onThinking: (content: string) => void
    onDone: () => void
    onError: (error: Error) => void
  }
) {
  const stream = await executor.stream({ input, chat_history: chatHistory })
  for await (const event of stream) {
    if (isToolCallEvent(event)) callbacks.onToolCall(event.toolCall)
    else if (isToolResultEvent(event)) callbacks.onToolResult(event.result)
    else if (isTokenEvent(event)) callbacks.onToken(event.token)
    else if (isThinkingEvent(event)) callbacks.onThinking(event.content)
  }
  callbacks.onDone()
}
```

### 系统提示词

```
你是 SessionBox 浏览器的 AI 助手。你可以帮助用户操控浏览器标签页和页面内容。

能力：
- 管理标签页：创建、关闭、切换、导航
- 页面交互：点击元素、输入文字、滚动页面
- 信息获取：获取页面内容、截图、查询标签详情

规则：
- 操作前先确认目标标签页（用户可能指定 tabId）
- 执行操作后报告结果
- 无法完成的操作要明确说明原因
- 对于破坏性操作（如关闭标签）要谨慎
```

## UI 组件设计

### App.vue 四面板布局

```
┌──────────┬────────────────────┬──────────────────┬───┐
│          │                    │                  │ R │
│ Sidebar  │   Main Content     │   Chat Panel     │ i │
│ (左)     │   (标签+WebView)   │   (可调整宽度)   │ g │
│ 260px    │   auto flex        │   380px default  │ h │
│          │                    │   可隐藏          │ t │
│          │                    │                  │   │
└──────────┴────────────────────┴──────────────────┴───┘
```

ChatPanel 作为 ResizablePanel 插入内容区与 RightPanel 之间，默认 380px，可拖拽调整。通过快捷键或工具栏按钮切换显示/隐藏。

### ChatPanel 组件层级

```
ChatPanel.vue
├── 头部
│   ├── BrowserViewPicker    ← 目标标签选择
│   ├── ModelSelector        ← 模型选择
│   ├── SessionManager       ← 会话管理
│   └── 关闭按钮
├── ChatMessageList.vue
│   └── ChatMessage.vue × N
│       ├── ThinkingBlock    ← 思考内容（可折叠）
│       ├── Markdown 渲染    ← 正文
│       ├── 图片展示
│       └── ToolCallCard × N ← 工具调用卡片
└── ChatInput.vue
    ├── 文本输入框（多行）
    ├── 图片上传按钮
    ├── 发送按钮
    └── 停止生成按钮
```

### ToolCallCard 状态可视化

```
┌─────────────────────────────────────┐
│ click_element                ✅ 完成 │
│ ┌─ 参数 ──────────────────────────┐ │
│ │ selector: "#login-btn"          │ │
│ └─────────────────────────────────┘ │
│ ┌─ 结果 (点击展开) ───────────────┐ │
│ │ { success: true }               │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

状态颜色：pending(灰) → running(蓝+动画) → completed(绿) → error(红)

### ThinkingBlock

```
▶ 💭 思考过程 (点击展开)
  展开后显示 extended thinking 内容
```

### ModelSelector

下拉菜单显示「供应商名 / 模型名」，底部「管理供应商」入口。

### BrowserViewPicker

下拉列出所有打开标签页，显示标题+域名，默认选中当前激活标签。

### SessionManager

下拉菜单：会话列表（按 updatedAt 排序），每项显示标题+时间+删除按钮，底部新建+清空。

### ProviderManager（对话框）

供应商列表，可展开查看模型。添加供应商：名称+API Base+API Key+测试连接。添加模型：ID+名称+maxTokens+能力标记。

## 状态管理

### Chat Store (src/stores/chat.ts)

```typescript
export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const isPanelVisible = ref(false)
  const targetTabId = ref<string | null>(null)

  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value)
  )

  async function loadSessions()            // 从 Dexie 加载
  async function createSession()           // 新建 + 持久化
  async function deleteSession(id)         // 删除 + 持久化
  async function switchSession(id)         // 切换 + 加载消息
  async function clearSession(id)          // 清空消息
  async function sendMessage(content, images?) // 发送 + Agent 运行
  function stopGeneration()                // 中断流式
  function togglePanel()                   // 切换面板可见性
})
```

### AI Provider Store (src/stores/ai-provider.ts)

```typescript
export const useAIProviderStore = defineStore('ai-provider', () => {
  const providers = ref<AIProvider[]>([])
  const selectedProviderId = ref<string | null>(null)
  const selectedModelId = ref<string | null>(null)

  const currentModel = computed(() => { /* 查找当前模型 */ })

  async function loadProviders()
  async function createProvider(data)
  async function updateProvider(data)
  async function deleteProvider(id)
  async function testConnection(id)
})
```

## 主进程 API 代理流程

```
渲染进程                           主进程
LangChain Agent ──IPC──→    ai-proxy.ts
  构造 messages + tools          验证 provider + model
                                 构造 Anthropic API 请求
                                 发送到 provider.apiBase
                                 逐 chunk 解析 SSE
  ←──IPC chunk──                webContents.send 回传
  ←──IPC tool_call──            工具调用事件
  ──IPC tool_result──→          注入工具结果继续流
  ←──IPC done──                 完成信号
```

关键：API Key 仅在主进程内存中，渲染进程只传 providerId。

## 预加载 API 新增

```typescript
chat: {
  completions: (params) => ipcRenderer.invoke('chat:completions', params),
},
aiProvider: {
  list: () => ipcRenderer.invoke('ai-provider:list'),
  create: (data) => ipcRenderer.invoke('ai-provider:create', data),
  update: (data) => ipcRenderer.invoke('ai-provider:update', data),
  delete: (id) => ipcRenderer.invoke('ai-provider:delete', id),
  test: (id) => ipcRenderer.invoke('ai-provider:test', id),
},
browser: {
  click: (args) => ipcRenderer.invoke('browser:click', args),
  type: (args) => ipcRenderer.invoke('browser:type', args),
  scroll: (args) => ipcRenderer.invoke('browser:scroll', args),
  select: (args) => ipcRenderer.invoke('browser:select', args),
  hover: (args) => ipcRenderer.invoke('browser:hover', args),
  getContent: (args) => ipcRenderer.invoke('browser:get-content', args),
  getDom: (args) => ipcRenderer.invoke('browser:get-dom', args),
  screenshot: (args) => ipcRenderer.invoke('browser:screenshot', args),
}
```

## 新增依赖

```json
{
  "@langchain/anthropic": "^0.3.x",
  "@langchain/core": "^0.3.x",
  "langchain": "^0.3.x",
  "marked": "^15.x",
  "highlight.js": "^11.x"
}
```

## 安全考虑

- API Key 在主进程加密存储，渲染进程无法直接访问
- 浏览器交互工具（点击、输入）通过 CDP 在主进程执行，渲染进程只传参数
- 未来可扩展：操作审计日志、工具粒度权限控制
