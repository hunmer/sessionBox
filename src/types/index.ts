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

// 账号
export interface Account {
  id: string
  groupId: string
  name: string
  icon: string
  proxyId?: string // 账号级代理（优先于分组代理）
  autoProxyEnabled?: boolean // 是否自动启用代理（默认 false）
  userAgent?: string // 自定义 UA（优先于全局默认值）
  defaultUrl: string // 启动 URL
  order: number
}

// 标签页（持久化模型）
export interface Tab {
  id: string
  accountId: string
  title: string
  url: string
  order: number
  pinned?: boolean // 固定标签
  muted?: boolean // 静音标签
}

// 书签文件夹
export interface BookmarkFolder {
  id: string
  name: string
  parentId: string | null // null = 根级
  order: number
}

// 书签（扩展自 FavoriteSite）
export interface FavoriteSite {
  id: string
  title: string
  url: string
  accountId?: string // 可选绑定账号，使用其 partition
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
