import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { pluginEventBus } from './plugin-event-bus'

// 数据模型类型定义
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

export interface Workspace {
  id: string
  title: string
  color: string
  order: number
  isDefault?: boolean
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
}

export interface BookmarkFolder {
  id: string
  name: string
  parentId: string | null // null = 根级
  order: number
}

export interface Bookmark {
  id: string
  title: string
  url: string
  pageId?: string // 可选绑定页面，使用其 partition
  favicon?: string   // 图标 URL
  folderId: string   // 所属文件夹
  order: number      // 排序
}

// 扩展配置
export interface Extension {
  id: string
  name: string
  path: string  // 扩展目录路径
  enabled: boolean
  icon?: string
}

// 窗口状态
export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

// 快捷键绑定（仅存储用户自定义的）
export interface ShortcutBindingStore {
  id: string
  accelerator: string
  global: boolean
}

// 分屏布局数据
export interface SplitLayoutData {
  presetType: string
  panes: Array<{ id: string; activeTabId: string | null; order: number }>
  direction: 'horizontal' | 'vertical'
  sizes: number[]
  manualAdjustEnabled?: boolean
  root?: {
    kind: 'pane' | 'branch'
    paneId?: string
    direction?: 'horizontal' | 'vertical'
    sizes?: number[]
    children?: SplitLayoutData['root'][]
  }
}

// 保存的分屏方案
export interface SavedSplitSchemeData {
  id: string
  name: string
  presetType: string
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]
  root?: SplitLayoutData['root']
}

// Tray 独立窗口尺寸
export interface TrayWindowSizes {
  newWindow: { width: number; height: number }
  desktop: { width: number; height: number }
  mobile: { width: number; height: number }
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

// 搜索引擎
export interface SearchEngine {
  id: string
  name: string
  url: string  // 搜索 URL，用 %s 占位代表用户输入
  icon?: string
}

// 更新源配置
export interface UpdateSource {
  id: string
  name: string
  type: 'github' | 'generic'
  // GitHub 源字段
  owner?: string
  repo?: string
  // Generic 源字段
  url?: string
}

interface StoreSchema {
  workspaces: Workspace[]
  groups: Group[]
  containers: Container[]
  pages: Page[]
  proxies: Proxy[]
  tabs: Tab[]
  bookmarkFolders: BookmarkFolder[]
  bookmarks: Bookmark[]
  extensions: Extension[]
  containerExtensions: Record<string, string[]>  // containerId -> extensionIds
  windowState: WindowState
  tabFreezeMinutes: number
  minimizeOnClose: boolean
  shortcuts: ShortcutBindingStore[]
  mutedSites: string[]  // 默认静音的网站域名列表
  splitStates: Record<string, SplitLayoutData>
  splitSchemes: SavedSplitSchemeData[]
  trayWindowSizes: TrayWindowSizes
  updateSources: UpdateSource[]
  activeUpdateSourceId: string
  snifferDomains: string[]
  passwords: PasswordEntry[]
  searchEngines: SearchEngine[]
  defaultSearchEngineId: string
}

const DEFAULT_WORKSPACE_ID = '__default__'
export const BOOKMARK_BAR_FOLDER_ID = '__bookmark_bar__'

const defaults: StoreSchema = {
  workspaces: [{ id: DEFAULT_WORKSPACE_ID, title: '默认工作区', color: '#3b82f6', order: 0, isDefault: true }],
  groups: [],
  containers: [{ id: 'default', name: '默认容器', icon: '📦', order: 0 }],
  pages: [],
  proxies: [],
  tabs: [],
  bookmarkFolders: [],
  bookmarks: [],
  extensions: [],
  containerExtensions: {},
  windowState: { width: 1280, height: 800, isMaximized: false },
  tabFreezeMinutes: 0, // 0 = 禁用冻结
  minimizeOnClose: true,
  shortcuts: [],
  mutedSites: [],
  splitStates: {},
  splitSchemes: [],
  trayWindowSizes: {
    newWindow: { width: 1280, height: 800 },
    desktop: { width: 480, height: 270 },
    mobile: { width: 270, height: 480 }
  },
  updateSources: [
    { id: 'github', name: 'GitHub', type: 'github', owner: 'hunmer', repo: 'sessionBox' }
  ],
  activeUpdateSourceId: 'github',
  snifferDomains: [],
  passwords: [],
  searchEngines: [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', icon: 'Search' },
    { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', icon: 'Search' },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', icon: 'Search' },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', icon: 'Search' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s', icon: 'Search' },
  ],
  defaultSearchEngineId: 'google'
}

const store = new Store<StoreSchema>({ defaults })

// 通用 CRUD 辅助
function getCollection<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key, defaults[key])
}

function setCollection<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value)
}

// ====== 工作区操作 ======

export function listWorkspaces(): Workspace[] {
  return getCollection('workspaces').sort((a, b) => a.order - b.order)
}

export function createWorkspace(title: string, color: string): Workspace {
  const workspaces = getCollection('workspaces')
  const workspace: Workspace = {
    id: randomUUID(),
    title,
    color,
    order: workspaces.length
  }
  workspaces.push(workspace)
  setCollection('workspaces', workspaces)
  try { pluginEventBus.emit('workspace:created', workspace) } catch {}
  return workspace
}

export function updateWorkspace(id: string, data: Partial<Omit<Workspace, 'id'>>): void {
  const workspaces = getCollection('workspaces')
  const idx = workspaces.findIndex((w) => w.id === id)
  if (idx === -1) throw new Error(`工作区 ${id} 不存在`)
  workspaces[idx] = { ...workspaces[idx], ...data }
  setCollection('workspaces', workspaces)
  try { pluginEventBus.emit('workspace:updated', { id, ...data }) } catch {}
}

export function deleteWorkspace(id: string): void {
  if (id === DEFAULT_WORKSPACE_ID) throw new Error('默认工作区不可删除')
  // 将该工作区下的分组移回默认工作区
  const groups = getCollection('groups').map((g) =>
    g.workspaceId === id ? { ...g, workspaceId: DEFAULT_WORKSPACE_ID } : g
  )
  setCollection('groups', groups)
  const workspaces = getCollection('workspaces').filter((w) => w.id !== id)
  setCollection('workspaces', workspaces)
  try { pluginEventBus.emit('workspace:deleted', id) } catch {}
}

export function reorderWorkspaces(workspaceIds: string[]): void {
  const workspaces = getCollection('workspaces')
  workspaceIds.forEach((id, order) => {
    const w = workspaces.find((w) => w.id === id)
    if (w) w.order = order
  })
  setCollection('workspaces', workspaces)
  try { pluginEventBus.emit('workspace:reordered', workspaceIds) } catch {}
}

// ====== 分组操作 ======

export function listGroups(): Group[] {
  return getCollection('groups').sort((a, b) => a.order - b.order)
}

export function createGroup(name: string, color?: string, workspaceId?: string, proxyId?: string, icon?: string): Group {
  const groups = getCollection('groups')
  const group: Group = {
    id: randomUUID(),
    name,
    order: groups.length,
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    workspaceId: workspaceId || DEFAULT_WORKSPACE_ID,
    ...(proxyId ? { proxyId } : {})
  }
  groups.push(group)
  setCollection('groups', groups)
  try { pluginEventBus.emit('group:created', group) } catch {}
  return group
}

export function updateGroup(id: string, data: Partial<Omit<Group, 'id'>>): void {
  const groups = getCollection('groups')
  const idx = groups.findIndex((g) => g.id === id)
  if (idx === -1) throw new Error(`分组 ${id} 不存在`)
  groups[idx] = { ...groups[idx], ...data }
  setCollection('groups', groups)
  try { pluginEventBus.emit('group:updated', { id, ...data }) } catch {}
}

export function deleteGroup(id: string): void {
  const groups = getCollection('groups')
  const group = groups.find((g) => g.id === id)
  setCollection('groups', groups.filter((g) => g.id !== id))
  try { pluginEventBus.emit('group:deleted', group) } catch {}
}

export function reorderGroups(groupIds: string[]): void {
  const groups = getCollection('groups')
  groupIds.forEach((id, order) => {
    const g = groups.find((g) => g.id === id)
    if (g) g.order = order
  })
  setCollection('groups', groups)
  try { pluginEventBus.emit('group:reordered', groupIds) } catch {}
}

// ====== 容器操作 ======

export function listContainers(): Container[] {
  return getCollection('containers').sort((a, b) => a.order - b.order)
}

export function createContainer(data: Omit<Container, 'id'>): Container {
  const containers = getCollection('containers')
  const container: Container = { ...data, id: randomUUID() }
  containers.push(container)
  setCollection('containers', containers)
  try { pluginEventBus.emit('container:created', container) } catch {}
  return container
}

export function updateContainer(id: string, data: Partial<Omit<Container, 'id'>>): void {
  const containers = getCollection('containers')
  const idx = containers.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error(`容器 ${id} 不存在`)
  containers[idx] = { ...containers[idx], ...data }
  setCollection('containers', containers)
  try { pluginEventBus.emit('container:updated', { id, ...data }) } catch {}
}

export function deleteContainer(id: string): void {
  const containers = getCollection('containers').filter((c) => c.id !== id)
  setCollection('containers', containers)
  try { pluginEventBus.emit('container:deleted', id) } catch {}
}

export function reorderContainers(containerIds: string[]): void {
  const containers = getCollection('containers')
  containerIds.forEach((id, order) => {
    const c = containers.find((c) => c.id === id)
    if (c) c.order = order
  })
  setCollection('containers', containers)
  try { pluginEventBus.emit('container:reordered', containerIds) } catch {}
}

// ====== 页面操作 ======

export function listPages(): Page[] {
  return getCollection<Page>('pages')
}

export function createPage(data: Omit<Page, 'id'>): Page {
  const pages = getCollection<Page>('pages')
  const page: Page = { ...data, id: randomUUID() }
  pages.push(page)
  setCollection('pages', pages)
  try { pluginEventBus.emit('page:created', page) } catch {}
  return page
}

export function updatePage(id: string, data: Partial<Omit<Page, 'id'>>): void {
  const pages = getCollection<Page>('pages')
  const idx = pages.findIndex(p => p.id === id)
  if (idx !== -1) {
    pages[idx] = { ...pages[idx], ...data }
    setCollection('pages', pages)
    try { pluginEventBus.emit('page:updated', { id, ...data }) } catch {}
  }
}

export function deletePage(id: string): void {
  const pages = getCollection<Page>('pages').filter(p => p.id !== id)
  setCollection('pages', pages)
  try { pluginEventBus.emit('page:deleted', id) } catch {}
}

export function reorderPages(pageIds: string[]): void {
  const pages = getCollection<Page>('pages')
  pageIds.forEach((id, order) => {
    const p = pages.find(p => p.id === id)
    if (p) p.order = order
  })
  setCollection('pages', pages)
  try { pluginEventBus.emit('page:reordered', pageIds) } catch {}
}

export function getPageById(id: string): Page | undefined {
  return getCollection<Page>('pages').find(p => p.id === id)
}

export function getPagesByGroup(groupId: string): Page[] {
  return getCollection<Page>('pages').filter(p => p.groupId === groupId)
}

export function getPagesByContainer(containerId: string): Page[] {
  return getCollection<Page>('pages').filter(p => p.containerId === containerId)
}

// ====== Page 数据迁移 ======

/** 将旧 Container 数据（含 groupId/defaultUrl）自动生成 Page */
export function migrateContainersToPages(): void {
  // 如果已有 pages 数据，跳过迁移
  if (store.has('pages')) {
    const existing = getCollection('pages')
    if (existing.length > 0) return
  }

  // 读取 containers 数据（可能含旧字段）
  const containers = getCollection<Record<string, any>>('containers')
  const pages: Page[] = []

  for (const c of containers) {
    // 只有含 groupId 的旧格式 container 才需要迁移
    if (c.groupId && c.defaultUrl) {
      pages.push({
        id: randomUUID(),
        groupId: c.groupId,
        containerId: c.id === 'default' ? undefined : c.id,
        name: c.name || '未命名页面',
        icon: c.icon || '',
        url: c.defaultUrl || 'https://www.baidu.com',
        order: c.order ?? 0,
        proxyId: c.proxyId,
        userAgent: c.userAgent,
      })
    }
  }

  if (pages.length > 0) {
    setCollection('pages', pages)
    console.log(`[Migration] Generated ${pages.length} pages from containers`)
  }
}

/** 将 Tab 的 containerId 迁移为 pageId */
export function migrateTabContainerIdToPageId(): void {
  const tabs = getCollection<Record<string, any>>('tabs')
  const pages = getCollection('pages')
  let updated = false

  const newTabs = tabs.map(tab => {
    // 如果已经有 pageId，跳过
    if (tab.pageId) return tab
    // 如果有旧的 containerId，查找对应的 page
    if (tab.containerId) {
      const page = pages.find((p: Page) => p.containerId === tab.containerId)
      updated = true
      return { ...tab, pageId: page?.id ?? '' }
    }
    return tab
  })

  if (updated) {
    setCollection('tabs', newTabs)
    console.log('[Migration] Updated tabs with pageId')
  }
}

/** 将 Bookmark 的 containerId 迁移为 pageId */
export function migrateBookmarkContainerIdToPageId(): void {
  const bookmarks = getCollection<Record<string, any>>('bookmarks')
  const pages = getCollection('pages')
  let updated = false

  const newBookmarks = bookmarks.map(b => {
    if (b.pageId) return b
    if (b.containerId) {
      const page = pages.find((p: Page) => p.containerId === b.containerId)
      updated = true
      return { ...b, pageId: page?.id ?? '' }
    }
    return b
  })

  if (updated) {
    setCollection('bookmarks', newBookmarks)
    console.log('[Migration] Updated bookmarks with pageId')
  }
}

// ====== 代理操作 ======

export function listProxies(): Proxy[] {
  return getCollection('proxies')
}

export function createProxy(data: Omit<Proxy, 'id'>): Proxy {
  const proxies = getCollection('proxies')
  const proxy: Proxy = { ...data, id: randomUUID() }
  proxies.push(proxy)
  setCollection('proxies', proxies)
  try { pluginEventBus.emit('proxy:created', proxy) } catch {}
  return proxy
}

export function updateProxy(id: string, data: Partial<Omit<Proxy, 'id'>>): void {
  const proxies = getCollection('proxies')
  const idx = proxies.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`代理 ${id} 不存在`)
  proxies[idx] = { ...proxies[idx], ...data }
  setCollection('proxies', proxies)
  try { pluginEventBus.emit('proxy:updated', { id, ...data }) } catch {}
}

export function deleteProxy(id: string): void {
  // 清除所有引用该代理的容器和分组
  const containers = getCollection('containers').map((c) =>
    c.proxyId === id ? { ...c, proxyId: undefined } : c
  )
  setCollection('containers', containers)

  const groups = getCollection('groups').map((g) =>
    g.proxyId === id ? { ...g, proxyId: undefined } : g
  )
  setCollection('groups', groups)

  const proxies = getCollection('proxies').filter((p) => p.id !== id)
  setCollection('proxies', proxies)
  try { pluginEventBus.emit('proxy:deleted', id) } catch {}
}

// ====== 辅助查询 ======

export function getContainerById(id: string): Container | undefined {
  return getCollection('containers').find((c) => c.id === id)
}

export function getGroupById(id: string): Group | undefined {
  return getCollection('groups').find((g) => g.id === id)
}

export function getProxyById(id: string): Proxy | undefined {
  return getCollection('proxies').find((p) => p.id === id)
}

// ====== Tab 操作 ======

export function listTabs(): Tab[] {
  return getCollection('tabs').sort((a, b) => a.order - b.order)
}

export function createTab(data: Omit<Tab, 'id'>): Tab {
  const tabs = getCollection('tabs')
  const tab: Tab = { ...data, id: randomUUID() }
  tabs.push(tab)
  setCollection('tabs', tabs)
  return tab
}

export function updateTab(id: string, data: Partial<Omit<Tab, 'id'>>): void {
  const tabs = getCollection('tabs')
  const idx = tabs.findIndex((t) => t.id === id)
  if (idx === -1) return
  tabs[idx] = { ...tabs[idx], ...data }
  setCollection('tabs', tabs)
}

export function deleteTab(id: string): void {
  const tabs = getCollection('tabs').filter((t) => t.id !== id)
  setCollection('tabs', tabs)
}

export function reorderTabs(tabIds: string[]): void {
  const tabs = getCollection('tabs')
  tabIds.forEach((id, order) => {
    const t = tabs.find((t) => t.id === id)
    if (t) t.order = order
  })
  setCollection('tabs', tabs)
}

export function saveTabs(tabs: Tab[]): void {
  setCollection('tabs', tabs)
}

// ====== 书签操作 ======

export function listBookmarks(folderId?: string): Bookmark[] {
  const sites = getCollection('bookmarks').sort((a, b) => a.order - b.order)
  if (folderId) return sites.filter((s) => s.folderId === folderId)
  return sites
}

export function createBookmark(data: Omit<Bookmark, 'id'>): Bookmark {
  const sites = getCollection('bookmarks')
  const site: Bookmark = { ...data, id: randomUUID() }
  sites.push(site)
  setCollection('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:created', site) } catch {}
  return site
}

export function updateBookmark(id: string, data: Partial<Omit<Bookmark, 'id'>>): void {
  const sites = getCollection('bookmarks')
  const idx = sites.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`书签 ${id} 不存在`)
  sites[idx] = { ...sites[idx], ...data }
  setCollection('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:updated', { id, ...data }) } catch {}
}

export function deleteBookmark(id: string): void {
  const sites = getCollection('bookmarks').filter((s) => s.id !== id)
  setCollection('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:deleted', id) } catch {}
}

export function batchDeleteBookmarks(ids: string[]): void {
  const idSet = new Set(ids)
  const sites = getCollection('bookmarks').filter((s) => !idSet.has(s.id))
  setCollection('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:batch-deleted', ids) } catch {}
}

export function reorderBookmarks(ids: string[]): void {
  const sites = getCollection('bookmarks')
  ids.forEach((id, order) => {
    const s = sites.find((s) => s.id === id)
    if (s) s.order = order
  })
  setCollection('bookmarks', sites)
}

// ====== 书签文件夹操作 ======

export function listBookmarkFolders(): BookmarkFolder[] {
  return getCollection('bookmarkFolders').sort((a, b) => a.order - b.order)
}

export function createBookmarkFolder(data: Omit<BookmarkFolder, 'id'>): BookmarkFolder {
  const folders = getCollection('bookmarkFolders')
  const folder: BookmarkFolder = { ...data, id: randomUUID() }
  folders.push(folder)
  setCollection('bookmarkFolders', folders)
  try { pluginEventBus.emit('bookmark-folder:created', folder) } catch {}
  return folder
}

export function updateBookmarkFolder(id: string, data: Partial<Omit<BookmarkFolder, 'id'>>): void {
  const folders = getCollection('bookmarkFolders')
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error(`文件夹 ${id} 不存在`)
  folders[idx] = { ...folders[idx], ...data }
  setCollection('bookmarkFolders', folders)
  try { pluginEventBus.emit('bookmark-folder:updated', { id, ...data }) } catch {}
}

export function deleteBookmarkFolder(id: string): void {
  // 级联删除子文件夹
  const folders = getCollection('bookmarkFolders')
  const childIds = collectChildFolderIds(folders, id)
  const idsToDelete = [id, ...childIds]
  setCollection('bookmarkFolders', folders.filter((f) => !idsToDelete.includes(f.id)))
  // 级联删除文件夹内的书签
  const sites = getCollection('bookmarks').filter((s) => !idsToDelete.includes(s.folderId))
  setCollection('bookmarks', sites)
  try { pluginEventBus.emit('bookmark-folder:deleted', id) } catch {}
}

/** 批量删除空文件夹（无书签且无子文件夹），返回被删除的文件夹 ID */
export function deleteEmptyBookmarkFolders(): string[] {
  const folders = getCollection('bookmarkFolders')
  const bookmarks = getCollection('bookmarks')

  // 找出所有空文件夹：没有直接子书签且没有子文件夹
  const emptyIds = new Set<string>()
  for (const folder of folders) {
    const hasChildFolders = folders.some((f) => f.parentId === folder.id && !emptyIds.has(f.id))
    const hasBookmarks = bookmarks.some((b) => b.folderId === folder.id)
    if (!hasChildFolders && !hasBookmarks) {
      emptyIds.add(folder.id)
    }
  }

  if (emptyIds.size === 0) return []

  // 删除后可能导致父级也变空，迭代清理
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (emptyIds.has(folder.id)) continue
      const hasChildFolders = folders.some((f) => f.parentId === folder.id && !emptyIds.has(f.id))
      const hasBookmarks = bookmarks.some((b) => b.folderId === folder.id)
      if (!hasChildFolders && !hasBookmarks) {
        emptyIds.add(folder.id)
        changed = true
      }
    }
  }

  setCollection(
    'bookmarkFolders',
    folders.filter((f) => !emptyIds.has(f.id))
  )
  return [...emptyIds]
}

export function reorderBookmarkFolders(ids: string[]): void {
  const folders = getCollection('bookmarkFolders')
  ids.forEach((id, order) => {
    const f = folders.find((f) => f.id === id)
    if (f) f.order = order
  })
  setCollection('bookmarkFolders', folders)
}

export function batchCreateBookmarkFolders(
  items: Omit<BookmarkFolder, 'id'>[]
): BookmarkFolder[] {
  const folders = getCollection('bookmarkFolders')
  const created: BookmarkFolder[] = []
  for (const data of items) {
    const folder: BookmarkFolder = { ...data, id: randomUUID() }
    folders.push(folder)
    created.push(folder)
  }
  setCollection('bookmarkFolders', folders)
  return created
}

export function batchCreateBookmarks(items: Omit<Bookmark, 'id'>[]): Bookmark[] {
  const sites = getCollection('bookmarks')
  const created: Bookmark[] = []
  for (const data of items) {
    const bookmark: Bookmark = { ...data, id: randomUUID() }
    sites.push(bookmark)
    created.push(bookmark)
  }
  setCollection('bookmarks', sites)
  return created
}

/** 递归收集所有子文件夹 ID */
function collectChildFolderIds(folders: BookmarkFolder[], parentId: string): string[] {
  const children = folders.filter((f) => f.parentId === parentId)
  const ids: string[] = []
  for (const child of children) {
    ids.push(child.id)
    ids.push(...collectChildFolderIds(folders, child.id))
  }
  return ids
}

// ====== 书签数据迁移 ======

/** 迁移旧存储键名 favoriteSites → bookmarks，以及检测旧数据（无 folderId 字段） */
export function migrateBookmarks(): void {
  // 迁移存储键名
  if (store.has('favoriteSites')) {
    const oldData = store.get('favoriteSites', [])
    if (oldData.length > 0 && !store.has('bookmarks')) {
      setCollection('bookmarks', oldData)
    }
    store.delete('favoriteSites')
  }

  const sites = getCollection('bookmarks')
  if (sites.length === 0) return

  // 检查是否需要迁移（旧数据没有 folderId 字段）
  const needsMigration = sites.some((s) => !('folderId' in s) || s.folderId === undefined)
  if (!needsMigration) return

  // 确保至少有一个根级文件夹用于迁移旧书签
  let folders = getCollection('bookmarkFolders')
  if (folders.length === 0) {
    const defaultFolder = { id: randomUUID(), name: '默认文件夹', parentId: null, order: 0 }
    folders.push(defaultFolder)
    setCollection('bookmarkFolders', folders)
  }
  // 如果存在旧的 __bookmark_bar__ 文件夹，重命名为"默认文件夹"
  const barFolder = folders.find((f) => f.id === BOOKMARK_BAR_FOLDER_ID)
  if (barFolder) {
    barFolder.name = '默认文件夹'
    setCollection('bookmarkFolders', folders)
  }
  const fallbackFolderId = folders[0].id

  // 迁移旧书签：赋予 folderId 和 order
  const migrated = sites.map((s, index) => ({
    ...s,
    folderId: s.folderId || fallbackFolderId,
    order: s.order ?? index
  }))
  setCollection('bookmarks', migrated)
}

// ====== 扩展操作 ======

export function listExtensions(): Extension[] {
  return getCollection('extensions')
}

export function createExtension(data: Omit<Extension, 'id'>): Extension {
  const extensions = getCollection('extensions')
  const extension: Extension = { ...data, id: randomUUID() }
  extensions.push(extension)
  setCollection('extensions', extensions)
  return extension
}

export function updateExtension(id: string, data: Partial<Omit<Extension, 'id'>>): void {
  const extensions = getCollection('extensions')
  const idx = extensions.findIndex((e) => e.id === id)
  if (idx === -1) throw new Error(`扩展 ${id} 不存在`)
  extensions[idx] = { ...extensions[idx], ...data }
  setCollection('extensions', extensions)
}

export function deleteExtension(id: string): void {
  const extensions = getCollection('extensions').filter((e) => e.id !== id)
  setCollection('extensions', extensions)
  // 从所有容器的扩展列表中移除
  const containerExtensions = getCollection('containerExtensions')
  for (const containerId in containerExtensions) {
    containerExtensions[containerId] = containerExtensions[containerId].filter((eid) => eid !== id)
  }
  setCollection('containerExtensions', containerExtensions)
}

export function getContainerExtensions(containerId: string): string[] {
  const containerExtensions = getCollection('containerExtensions')
  return containerExtensions[containerId] || []
}

export function setContainerExtensions(containerId: string, extensionIds: string[]): void {
  const containerExtensions = getCollection('containerExtensions')
  containerExtensions[containerId] = extensionIds
  setCollection('containerExtensions', containerExtensions)
}

export function addExtensionToContainer(containerId: string, extensionId: string): void {
  const containerExtensions = getCollection('containerExtensions')
  if (!containerExtensions[containerId]) {
    containerExtensions[containerId] = []
  }
  if (!containerExtensions[containerId].includes(extensionId)) {
    containerExtensions[containerId].push(extensionId)
    setCollection('containerExtensions', containerExtensions)
  }
}

export function removeExtensionFromContainer(containerId: string, extensionId: string): void {
  const containerExtensions = getCollection('containerExtensions')
  if (containerExtensions[containerId]) {
    containerExtensions[containerId] = containerExtensions[containerId].filter((id) => id !== extensionId)
    setCollection('containerExtensions', containerExtensions)
  }
}

// ====== 窗口状态操作 ======

export function getWindowState(): WindowState {
  return store.get('windowState', defaults.windowState)
}

export function setWindowState(state: WindowState): void {
  store.set('windowState', state)
}

// ====== 应用设置 ======

export function getTabFreezeMinutes(): number {
  return store.get('tabFreezeMinutes', 0)
}

export function setTabFreezeMinutes(minutes: number): void {
  store.set('tabFreezeMinutes', minutes)
}

export function getMinimizeOnClose(): boolean {
  return store.get('minimizeOnClose', true)
}

export function setMinimizeOnClose(enabled: boolean): void {
  store.set('minimizeOnClose', enabled)
}

// ====== 快捷键绑定操作 ======

export function getShortcutBindings(): ShortcutBindingStore[] {
  return store.get('shortcuts', [])
}

export function setShortcutBindings(bindings: ShortcutBindingStore[]): void {
  store.set('shortcuts', bindings)
}

// ====== 默认静音网站操作 ======

export function getMutedSites(): string[] {
  return store.get('mutedSites', [])
}

export function setMutedSites(sites: string[]): void {
  store.set('mutedSites', sites)
}

export function addMutedSite(hostname: string): void {
  const sites = store.get('mutedSites', [])
  if (!sites.includes(hostname)) {
    sites.push(hostname)
    store.set('mutedSites', sites)
  }
}

export function removeMutedSite(hostname: string): void {
  const sites = store.get('mutedSites', []).filter((s) => s !== hostname)
  store.set('mutedSites', sites)
}

// ====== Split View ======

export function getSplitState(workspaceId: string): SplitLayoutData | null {
  const states = store.get('splitStates', defaults.splitStates)
  return states[workspaceId] ?? null
}

export function setSplitState(workspaceId: string, data: SplitLayoutData): void {
  const states = store.get('splitStates', defaults.splitStates)
  states[workspaceId] = data
  store.set('splitStates', states)
}

export function clearSplitState(workspaceId: string): void {
  const states = store.get('splitStates', defaults.splitStates)
  delete states[workspaceId]
  store.set('splitStates', states)
}

export function listSplitSchemes(): SavedSplitSchemeData[] {
  return store.get('splitSchemes', defaults.splitSchemes)
}

export function createSplitScheme(data: SavedSplitSchemeData): SavedSplitSchemeData {
  const schemes = store.get('splitSchemes', defaults.splitSchemes)
  schemes.push(data)
  store.set('splitSchemes', schemes)
  return data
}

export function deleteSplitScheme(id: string): void {
  const schemes = store.get('splitSchemes', defaults.splitSchemes)
  store.set('splitSchemes', schemes.filter((s) => s.id !== id))
}

// ====== Tray 窗口尺寸 ======

export function getTrayWindowSizes(): TrayWindowSizes {
  return store.get('trayWindowSizes', defaults.trayWindowSizes)
}

export function setTrayWindowSizes(sizes: TrayWindowSizes): void {
  store.set('trayWindowSizes', sizes)
}

export function updateTrayWindowSize(
  type: keyof TrayWindowSizes,
  size: { width: number; height: number }
): void {
  const sizes = getTrayWindowSizes()
  sizes[type] = size
  store.set('trayWindowSizes', sizes)
}

// ====== 更新源操作 ======

export function listUpdateSources(): UpdateSource[] {
  return store.get('updateSources', defaults.updateSources)
}

export function getActiveUpdateSourceId(): string {
  return store.get('activeUpdateSourceId', defaults.activeUpdateSourceId)
}

export function getActiveUpdateSource(): UpdateSource | undefined {
  const sources = listUpdateSources()
  const activeId = getActiveUpdateSourceId()
  return sources.find((s) => s.id === activeId)
}

export function setActiveUpdateSourceId(id: string): void {
  const sources = listUpdateSources()
  if (!sources.find((s) => s.id === id)) {
    throw new Error(`更新源 ${id} 不存在`)
  }
  store.set('activeUpdateSourceId', id)
}

export function addUpdateSource(source: UpdateSource): void {
  const sources = listUpdateSources()
  if (sources.find((s) => s.id === source.id)) {
    throw new Error(`更新源 ${source.id} 已存在`)
  }
  sources.push(source)
  store.set('updateSources', sources)
}

export function removeUpdateSource(id: string): void {
  // 不允许删除默认 GitHub 源
  if (id === 'github') return
  const sources = listUpdateSources().filter((s) => s.id !== id)
  store.set('updateSources', sources)
  // 如果删除的是当前激活源，切回 GitHub
  if (getActiveUpdateSourceId() === id) {
    store.set('activeUpdateSourceId', 'github')
  }
}

export function updateUpdateSource(id: string, data: Partial<Omit<UpdateSource, 'id'>>): void {
  const sources = listUpdateSources()
  const idx = sources.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`更新源 ${id} 不存在`)
  sources[idx] = { ...sources[idx], ...data }
  store.set('updateSources', sources)
}

// ====== 嗅探器域名规则 ======

export function getSnifferDomains(): string[] {
  return store.get('snifferDomains', defaults.snifferDomains)
}

export function addSnifferDomain(domain: string): void {
  const domains = getSnifferDomains()
  if (!domains.includes(domain)) {
    domains.push(domain)
    store.set('snifferDomains', domains)
  }
}

export function removeSnifferDomain(domain: string): void {
  const domains = getSnifferDomains().filter(d => d !== domain)
  store.set('snifferDomains', domains)
}

// ====== 密码/笔记管理 ======

export function listPasswords(): PasswordEntry[] {
  return getCollection('passwords').sort((a, b) => a.order - b.order)
}

export function listPasswordsBySite(siteOrigin: string): PasswordEntry[] {
  return getCollection('passwords')
    .filter((p) => p.siteOrigin === siteOrigin)
    .sort((a, b) => a.order - b.order)
}

export function createPassword(data: Omit<PasswordEntry, 'id'>): PasswordEntry {
  const passwords = getCollection('passwords')
  const entry: PasswordEntry = { ...data, id: randomUUID() }
  passwords.push(entry)
  setCollection('passwords', passwords)
  return entry
}

export function updatePassword(id: string, data: Partial<Omit<PasswordEntry, 'id'>>): void {
  const passwords = getCollection('passwords')
  const idx = passwords.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`密码条目 ${id} 不存在`)
  passwords[idx] = { ...passwords[idx], ...data, updatedAt: Date.now() }
  setCollection('passwords', passwords)
}

export function deletePassword(id: string): void {
  const passwords = getCollection('passwords').filter((p) => p.id !== id)
  setCollection('passwords', passwords)
}

// ====== 搜索引擎操作 ======

export function listSearchEngines(): SearchEngine[] {
  return getCollection('searchEngines')
}

export function setSearchEngines(engines: SearchEngine[]): void {
  setCollection('searchEngines', engines)
}

export function getDefaultSearchEngineId(): string {
  return store.get('defaultSearchEngineId', defaults.defaultSearchEngineId)
}

export function setDefaultSearchEngineId(id: string): void {
  store.set('defaultSearchEngineId', id)
}
