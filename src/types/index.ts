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
