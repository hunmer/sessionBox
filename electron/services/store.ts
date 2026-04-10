import Store from 'electron-store'
import { randomUUID } from 'crypto'

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

export interface Account {
  id: string
  groupId: string
  name: string
  icon: string
  proxyId?: string
  autoProxyEnabled?: boolean // 是否自动启用代理（默认 false）
  userAgent?: string
  defaultUrl: string
  order: number
}

export interface Tab {
  id: string
  accountId: string
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
  accountId?: string // 可选绑定账号，使用其 partition
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

interface StoreSchema {
  workspaces: Workspace[]
  groups: Group[]
  accounts: Account[]
  proxies: Proxy[]
  tabs: Tab[]
  bookmarkFolders: BookmarkFolder[]
  bookmarks: Bookmark[]
  extensions: Extension[]
  accountExtensions: Record<string, string[]>  // accountId -> extensionIds
  windowState: WindowState
  tabFreezeMinutes: number
  shortcuts: ShortcutBindingStore[]
}

const DEFAULT_WORKSPACE_ID = '__default__'
export const BOOKMARK_BAR_FOLDER_ID = '__bookmark_bar__'

const defaults: StoreSchema = {
  workspaces: [{ id: DEFAULT_WORKSPACE_ID, title: '默认工作区', color: '#3b82f6', order: 0, isDefault: true }],
  groups: [],
  accounts: [],
  proxies: [],
  tabs: [],
  bookmarkFolders: [{ id: BOOKMARK_BAR_FOLDER_ID, name: '书签栏', parentId: null, order: 0 }],
  bookmarks: [
    { id: 'default-douyin', title: '抖音', url: 'https://www.douyin.com', folderId: BOOKMARK_BAR_FOLDER_ID, order: 0 },
    { id: 'default-iqiyi', title: '爱奇艺', url: 'https://www.iqiyi.com', folderId: BOOKMARK_BAR_FOLDER_ID, order: 1 },
    { id: 'default-qq', title: '腾讯', url: 'https://www.qq.com', folderId: BOOKMARK_BAR_FOLDER_ID, order: 2 },
    { id: 'default-douyin-creator', title: '抖音创作者中心', url: 'https://creator.douyin.com/creator-micro/home', folderId: BOOKMARK_BAR_FOLDER_ID, order: 3 },
    { id: 'default-wechat', title: '微信视频号助手', url: 'https://channels.weixin.qq.com/platform/post/create', folderId: BOOKMARK_BAR_FOLDER_ID, order: 4 }
  ],
  extensions: [],
  accountExtensions: {},
  windowState: { width: 1280, height: 800, isMaximized: false },
  tabFreezeMinutes: 0, // 0 = 禁用冻结
  shortcuts: []
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
  return workspace
}

export function updateWorkspace(id: string, data: Partial<Omit<Workspace, 'id'>>): void {
  const workspaces = getCollection('workspaces')
  const idx = workspaces.findIndex((w) => w.id === id)
  if (idx === -1) throw new Error(`工作区 ${id} 不存在`)
  workspaces[idx] = { ...workspaces[idx], ...data }
  setCollection('workspaces', workspaces)
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
}

export function reorderWorkspaces(workspaceIds: string[]): void {
  const workspaces = getCollection('workspaces')
  workspaceIds.forEach((id, order) => {
    const w = workspaces.find((w) => w.id === id)
    if (w) w.order = order
  })
  setCollection('workspaces', workspaces)
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
  return group
}

export function updateGroup(id: string, data: Partial<Omit<Group, 'id'>>): void {
  const groups = getCollection('groups')
  const idx = groups.findIndex((g) => g.id === id)
  if (idx === -1) throw new Error(`分组 ${id} 不存在`)
  groups[idx] = { ...groups[idx], ...data }
  setCollection('groups', groups)
}

export function deleteGroup(id: string): void {
  const groups = getCollection('groups')
  const accounts = getCollection('accounts')

  // 将该分组下的账号移到同工作区的其他分组
  const affected = accounts.filter((a) => a.groupId === id)
  if (affected.length > 0) {
    const group = groups.find((g) => g.id === id)
    const targetGroup =
      groups.find(
        (g) =>
          g.id !== id &&
          (g.workspaceId || DEFAULT_WORKSPACE_ID) === (group?.workspaceId || DEFAULT_WORKSPACE_ID)
      ) ?? groups.find((g) => g.id !== id)

    if (!targetGroup) throw new Error('无法删除唯一分组')

    setCollection(
      'accounts',
      accounts.map((a) => (a.groupId === id ? { ...a, groupId: targetGroup.id } : a))
    )
  }

  setCollection('groups', groups.filter((g) => g.id !== id))
}

export function reorderGroups(groupIds: string[]): void {
  const groups = getCollection('groups')
  groupIds.forEach((id, order) => {
    const g = groups.find((g) => g.id === id)
    if (g) g.order = order
  })
  setCollection('groups', groups)
}

// ====== 账号操作 ======

export function listAccounts(): Account[] {
  return getCollection('accounts').sort((a, b) => a.order - b.order)
}

export function createAccount(data: Omit<Account, 'id'>): Account {
  const accounts = getCollection('accounts')
  const account: Account = { ...data, id: randomUUID() }
  accounts.push(account)
  setCollection('accounts', accounts)
  return account
}

export function updateAccount(id: string, data: Partial<Omit<Account, 'id'>>): void {
  const accounts = getCollection('accounts')
  const idx = accounts.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error(`账号 ${id} 不存在`)
  accounts[idx] = { ...accounts[idx], ...data }
  setCollection('accounts', accounts)
}

export function deleteAccount(id: string): void {
  const accounts = getCollection('accounts').filter((a) => a.id !== id)
  setCollection('accounts', accounts)
}

export function reorderAccounts(accountIds: string[]): void {
  const accounts = getCollection('accounts')
  accountIds.forEach((id, order) => {
    const a = accounts.find((a) => a.id === id)
    if (a) a.order = order
  })
  setCollection('accounts', accounts)
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
  return proxy
}

export function updateProxy(id: string, data: Partial<Omit<Proxy, 'id'>>): void {
  const proxies = getCollection('proxies')
  const idx = proxies.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`代理 ${id} 不存在`)
  proxies[idx] = { ...proxies[idx], ...data }
  setCollection('proxies', proxies)
}

export function deleteProxy(id: string): void {
  // 清除所有引用该代理的账号和分组
  const accounts = getCollection('accounts').map((a) =>
    a.proxyId === id ? { ...a, proxyId: undefined } : a
  )
  setCollection('accounts', accounts)

  const groups = getCollection('groups').map((g) =>
    g.proxyId === id ? { ...g, proxyId: undefined } : g
  )
  setCollection('groups', groups)

  const proxies = getCollection('proxies').filter((p) => p.id !== id)
  setCollection('proxies', proxies)
}

// ====== 辅助查询 ======

export function getAccountById(id: string): Account | undefined {
  return getCollection('accounts').find((a) => a.id === id)
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
  return site
}

export function updateBookmark(id: string, data: Partial<Omit<Bookmark, 'id'>>): void {
  const sites = getCollection('bookmarks')
  const idx = sites.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`书签 ${id} 不存在`)
  sites[idx] = { ...sites[idx], ...data }
  setCollection('bookmarks', sites)
}

export function deleteBookmark(id: string): void {
  const sites = getCollection('bookmarks').filter((s) => s.id !== id)
  setCollection('bookmarks', sites)
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
  return folder
}

export function updateBookmarkFolder(id: string, data: Partial<Omit<BookmarkFolder, 'id'>>): void {
  const folders = getCollection('bookmarkFolders')
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error(`文件夹 ${id} 不存在`)
  folders[idx] = { ...folders[idx], ...data }
  setCollection('bookmarkFolders', folders)
}

export function deleteBookmarkFolder(id: string): void {
  if (id === BOOKMARK_BAR_FOLDER_ID) throw new Error('书签栏文件夹不可删除')
  // 级联删除子文件夹
  const folders = getCollection('bookmarkFolders')
  const childIds = collectChildFolderIds(folders, id)
  const idsToDelete = [id, ...childIds]
  setCollection('bookmarkFolders', folders.filter((f) => !idsToDelete.includes(f.id)))
  // 级联删除文件夹内的书签
  const sites = getCollection('bookmarks').filter((s) => !idsToDelete.includes(s.folderId))
  setCollection('bookmarks', sites)
}

export function reorderBookmarkFolders(ids: string[]): void {
  const folders = getCollection('bookmarkFolders')
  ids.forEach((id, order) => {
    const f = folders.find((f) => f.id === id)
    if (f) f.order = order
  })
  setCollection('bookmarkFolders', folders)
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

  // 确保书签栏文件夹存在
  const folders = getCollection('bookmarkFolders')
  if (!folders.some((f) => f.id === BOOKMARK_BAR_FOLDER_ID)) {
    folders.push({ id: BOOKMARK_BAR_FOLDER_ID, name: '书签栏', parentId: null, order: 0 })
    setCollection('bookmarkFolders', folders)
  }

  // 迁移旧书签：赋予 folderId 和 order
  const migrated = sites.map((s, index) => ({
    ...s,
    folderId: s.folderId || BOOKMARK_BAR_FOLDER_ID,
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
  // 从所有账号的扩展列表中移除
  const accountExtensions = getCollection('accountExtensions')
  for (const accountId in accountExtensions) {
    accountExtensions[accountId] = accountExtensions[accountId].filter((eid) => eid !== id)
  }
  setCollection('accountExtensions', accountExtensions)
}

export function getAccountExtensions(accountId: string): string[] {
  const accountExtensions = getCollection('accountExtensions')
  return accountExtensions[accountId] || []
}

export function setAccountExtensions(accountId: string, extensionIds: string[]): void {
  const accountExtensions = getCollection('accountExtensions')
  accountExtensions[accountId] = extensionIds
  setCollection('accountExtensions', accountExtensions)
}

export function addExtensionToAccount(accountId: string, extensionId: string): void {
  const accountExtensions = getCollection('accountExtensions')
  if (!accountExtensions[accountId]) {
    accountExtensions[accountId] = []
  }
  if (!accountExtensions[accountId].includes(extensionId)) {
    accountExtensions[accountId].push(extensionId)
    setCollection('accountExtensions', accountExtensions)
  }
}

export function removeExtensionFromAccount(accountId: string, extensionId: string): void {
  const accountExtensions = getCollection('accountExtensions')
  if (accountExtensions[accountId]) {
    accountExtensions[accountId] = accountExtensions[accountId].filter((id) => id !== extensionId)
    setCollection('accountExtensions', accountExtensions)
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

// ====== 快捷键绑定操作 ======

export function getShortcutBindings(): ShortcutBindingStore[] {
  return store.get('shortcuts', [])
}

export function setShortcutBindings(bindings: ShortcutBindingStore[]): void {
  store.set('shortcuts', bindings)
}
