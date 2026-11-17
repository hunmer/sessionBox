// 类型定义（与主进程 store.ts 保持一致）
// 说明：以下类型原样迁移自 preload/index.ts，preload/index.ts 仍按原名 re-export，外部导入路径不变。
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

export interface SiteDataInfo {
  origin: string
  hostname: string
  cookieCount: number
  storageBytes: number
  usageBytes: number
  quotaBytes: number
}

export interface Workspace {
  id: string
  title: string
  color: string
  order: number
  isDefault?: boolean
  icon?: string
}

export interface Group {
  id: string
  name: string
  order: number
  icon?: string
  proxyId?: string
  color?: string
  workspaceId?: string
}

export interface Container {
  id: string
  name: string
  icon: string
  proxyId?: string
  autoProxyEnabled?: boolean
  order: number
}

export interface Page {
  id: string
  groupId: string
  parentId?: string        // 父页面 id，空 = 顶层页面
  containerId?: string    // 空 = 走默认容器
  name: string
  icon: string
  url: string             // 默认启动 URL
  order: number
  proxyId?: string        // 页面级代理（覆盖容器代理）
  userAgent?: string
}

export interface Tab {
  id: string
  pageId: string
  title: string
  url: string
  order: number
  pinned?: boolean
  muted?: boolean
  workspaceId?: string
}

export interface NavState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

export interface BookmarkFolder {
  id: string
  name: string
  parentId: string | null
  order: number
}

export interface Bookmark {
  id: string
  title: string
  url: string
  pageId?: string
  favicon?: string
  folderId: string
  order: number
}

// 密码/笔记字段
export interface PasswordField {
  id: string
  name: string
  type: 'text' | 'textarea' | 'checkbox'
  value: string
  protected?: boolean
}

// 密码/笔记条目
export interface PasswordEntry {
  id: string
  siteOrigin: string
  siteName?: string
  name: string
  fields: PasswordField[]
  order: number
  createdAt: number
  updatedAt: number
}

// 扩展配置
export interface Extension {
  id: string
  name: string
  path: string
  enabled: boolean
  pinned?: boolean
  icon?: string
  electronExtensionId?: string
  userScriptsEnabled?: boolean
  compatibilityWarnings?: string[]
}

export interface ExtensionDownloadProgress {
  received: number
  total: number | null
}

// 快捷键条目
export interface ShortcutItem {
  id: string
  label: string
  accelerator: string
  global: boolean
  enabled: boolean
  supportsGlobal: boolean
  defaultAccelerator: string
  group: string
}

/** 快捷键分组 */
export interface ShortcutGroup {
  key: string
  label: string
}

// 插件相关类型
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string
}

// 搜索引擎
export interface SearchEngine {
  id: string
  name: string
  url: string
  icon?: string
}

// 分屏相关类型
export interface SplitPaneData {
  id: string
  activeTabId: string | null
  order: number
}

export interface SplitNodeData {
  kind: 'pane' | 'branch'
  paneId?: string
  direction?: 'horizontal' | 'vertical'
  sizes?: number[]
  children?: SplitNodeData[]
}

export interface SplitLayoutData {
  presetType: string
  panes: SplitPaneData[]
  direction: 'horizontal' | 'vertical'
  sizes: number[]
  manualAdjustEnabled?: boolean
  root?: SplitNodeData
}

export interface SavedSplitSchemeData {
  id: string
  name: string
  presetType: string
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]
  root?: SplitNodeData
}

export interface DefaultBrowserResult {
  isDefault: boolean
  requiresSystemSelection: boolean
  openedSystemSettings: boolean
}

export type TabImplementation = 'browsercontent' | 'webview'

// 数据同步相关类型
export interface SyncTypes {
  bookmarks: boolean
  history: boolean
  extensions: boolean
  plugins: boolean
  proxies: boolean
  containers: boolean
}

export interface SyncConfig {
  serverUrl: string
  userId: string
  types: SyncTypes
  lastSyncAt: number
}

export interface SyncCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly?: boolean
  session?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

export type ExternalAuthBrowser = 'chrome' | 'edge'
export interface ExternalAuthResult {
  ok: boolean
  pending?: boolean
  cookieCount?: number
  finalUrl?: string
  error?: string
}

// Chat 补全参数
export interface ChatCompletionParams {
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
