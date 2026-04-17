/**
 * 渲染进程数据模型类型定义
 * 与 preload/index.ts 及主进程 store.ts 保持一致
 */

// 代理配置
export interface Proxy {
  id: string
  name: string
  enabled?: boolean // 代理是否启用（默认 true）
  proxyMode?: 'global' | 'custom' | 'pac_url'
  type?: 'socks5' | 'http' | 'https'
  host?: string
  port?: number
  username?: string
  password?: string
  pacScript?: string
  pacUrl?: string
}

// 工作区
export interface Workspace {
  id: string
  title: string
  color: string
  order: number
  isDefault?: boolean // 默认工作区标记
}

// 分组
export interface Group {
  id: string
  name: string
  order: number
  icon?: string // 分组图标（emoji / lucide:xxx / img:xxx）
  proxyId?: string // 分组级代理绑定
  color?: string // 分组颜色
  workspaceId?: string // 所属工作区
}

// 容器
export interface Container {
  id: string
  name: string
  icon: string
  proxyId?: string // 容器级代理（优先于分组代理）
  autoProxyEnabled?: boolean // 是否自动将绑定代理应用到当前容器 session
  order: number
}

// 页面
export interface Page {
  id: string
  groupId: string
  containerId?: string    // 空 = 走默认容器
  name: string
  icon: string
  url: string             // 默认启动 URL
  order: number
  proxyId?: string        // 页面级代理（覆盖容器代理）
  userAgent?: string
}

// 标签页（持久化模型）
export interface Tab {
  id: string
  pageId: string
  title: string
  url: string
  order: number
  pinned?: boolean // 固定标签
  muted?: boolean // 静音标签
  workspaceId?: string // 无 pageId 关联时的工作区归属
}

// 书签文件夹
export interface BookmarkFolder {
  id: string
  name: string
  parentId: string | null // null = 根级
  order: number
}

// 书签
export interface Bookmark {
  id: string
  title: string
  url: string
  pageId?: string // 可选绑定页面，使用其 partition
  favicon?: string   // 图标 URL
  folderId: string   // 所属文件夹
  order: number      // 排序
}

// 导航状态（运行时，不持久化）
export interface NavState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

// 扩展配置
export interface Extension {
  id: string
  name: string
  path: string
  enabled: boolean
  icon?: string
}

// 嗅探到的网络资源
export interface SniffedResource {
  id: string
  url: string
  type: 'video' | 'audio' | 'image'
  mimeType: string
  size?: number
  timestamp: number
}

// 密码/笔记字段
export interface PasswordField {
  id: string
  name: string
  type: 'text' | 'textarea' | 'checkbox'
  value: string
  protected?: boolean  // 密码类字段，显示遮罩
}

// 密码/笔记条目
export interface PasswordEntry {
  id: string
  siteOrigin: string   // 站点 origin，如 "https://github.com"
  siteName?: string    // 站点显示名
  name: string         // 条目名称，如 "个人账号"
  fields: PasswordField[]
  order: number
  createdAt: number
  updatedAt: number
}

export interface DefaultBrowserResult {
  isDefault: boolean
  requiresSystemSelection: boolean
  openedSystemSettings: boolean
}

export type {
  SplitPane,
  SplitPresetType,
  SplitLayoutType,
  SplitDirection,
  SplitDropPosition,
  SplitLeafNode,
  SplitBranchNode,
  SplitNode,
  SplitLayout,
  SavedSplitScheme,
  PaneBounds
} from './split'

export type { PluginInfo, PluginMeta, PluginContext, PluginInstance, RemotePlugin } from './plugin'

// ==================== AI Chat 类型 ====================

export interface ChatSession {
  id: string
  title: string
  scope: string               // 会话归属的作用域（agent / workflow / ...）
  workflowId?: string | null  // 绑定的工作流 ID
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
  /** 工具调用在文本中的位置（字符偏移量），用于按顺序穿插渲染 */
  textPosition?: number
  /** 流式事件到达顺序，用于同一 textPosition 下稳定排序 */
  renderOrder?: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface ChatThinkingBlock {
  index: number
  content: string
  /** thinking 开始时对应的文本偏移，用于稳定穿插到 tool/text 之间 */
  textPosition?: number
  /** 流式事件到达顺序，用于同一 textPosition 下稳定排序 */
  renderOrder?: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolCalls?: ToolCall[]
  toolResult?: unknown
  thinkingBlocks?: ChatThinkingBlock[]
  images?: string[]
  modelId?: string
  usage?: TokenUsage
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
  system?: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  _mode?: 'workflow'
  _workflowId?: string
  targetTabId?: string
  enabledToolNames?: string[]
}

/** ChatInput 工具下拉展示项 */
export interface ToolDisplayItem {
  name: string
  description: string
  category: string
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

// 工作流
export type {
  WorkflowFolder,
  WorkflowNode,
  WorkflowEdge,
  Workflow,
  NodeProperty,
  NodeTypeDefinition,
  OutputField,
  ExecutionStep,
  ExecutionLog,
} from '@/lib/workflow/types'
