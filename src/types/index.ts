/**
 * 渲染进程数据模型类型定义
 * 与 preload/index.ts 及主进程 store.ts 保持一致
 */

// 代理配置
export interface Proxy {
  id: string
  name: string
  type: 'socks5' | 'http' | 'https'
  host: string
  port: number
  username?: string
  password?: string
}

// 分组
export interface Group {
  id: string
  name: string
  order: number
  proxyId?: string // 分组级代理绑定
  color?: string // 分组颜色
}

// 账号
export interface Account {
  id: string
  groupId: string
  name: string
  icon: string
  proxyId?: string // 账号级代理（优先于分组代理）
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
}

// 常用网站
export interface FavoriteSite {
  id: string
  title: string
  url: string
  accountId?: string // 可选绑定账号，使用其 partition
  favicon?: string   // 图标 URL
}

// 导航状态（运行时，不持久化）
export interface NavState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}
