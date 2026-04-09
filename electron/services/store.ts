import Store from 'electron-store'
import { randomUUID } from 'crypto'

// 数据模型类型定义
export interface Proxy {
  id: string
  name: string
  type: 'socks5' | 'http' | 'https'
  host: string
  port: number
  username?: string
  password?: string
}

export interface Group {
  id: string
  name: string
  order: number
  proxyId?: string
  color?: string
}

export interface Account {
  id: string
  groupId: string
  name: string
  icon: string
  proxyId?: string
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
}

export interface FavoriteSite {
  id: string
  title: string
  url: string
  accountId?: string // 可选绑定账号，使用其 partition
  favicon?: string   // 图标 URL
}

// 扩展配置
export interface Extension {
  id: string
  name: string
  path: string  // 扩展目录路径
  enabled: boolean
  icon?: string
}

interface StoreSchema {
  groups: Group[]
  accounts: Account[]
  proxies: Proxy[]
  tabs: Tab[]
  favoriteSites: FavoriteSite[]
  extensions: Extension[]
  accountExtensions: Record<string, string[]>  // accountId -> extensionIds
}

const defaults: StoreSchema = {
  groups: [],
  accounts: [],
  proxies: [],
  tabs: [],
  favoriteSites: [
    { id: 'default-douyin', title: '抖音', url: 'https://www.douyin.com' },
    { id: 'default-iqiyi', title: '爱奇艺', url: 'https://www.iqiyi.com' },
    { id: 'default-qq', title: '腾讯', url: 'https://www.qq.com' },
    { id: 'default-douyin-creator', title: '抖音创作者中心', url: 'https://creator.douyin.com/creator-micro/home' },
    { id: 'default-wechat', title: '微信视频号助手', url: 'https://channels.weixin.qq.com/platform/post/create' }
  ],
  extensions: [],
  accountExtensions: {}
}

const store = new Store<StoreSchema>({ defaults })

// 通用 CRUD 辅助
function getCollection<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key, defaults[key])
}

function setCollection<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value)
}

// ====== 分组操作 ======

export function listGroups(): Group[] {
  return getCollection('groups').sort((a, b) => a.order - b.order)
}

export function createGroup(name: string, color?: string): Group {
  const groups = getCollection('groups')
  const group: Group = {
    id: randomUUID(),
    name,
    order: groups.length,
    ...(color ? { color } : {})
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
  const accounts = getCollection('accounts')
  if (accounts.some((a) => a.groupId === id)) {
    throw new Error('分组内仍有账号，请先删除或移出所有账号')
  }
  const groups = getCollection('groups').filter((g) => g.id !== id)
  setCollection('groups', groups)
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

// ====== 常用网站操作 ======

export function listFavoriteSites(): FavoriteSite[] {
  return getCollection('favoriteSites')
}

export function createFavoriteSite(data: Omit<FavoriteSite, 'id'>): FavoriteSite {
  const sites = getCollection('favoriteSites')
  const site: FavoriteSite = { ...data, id: randomUUID() }
  sites.push(site)
  setCollection('favoriteSites', sites)
  return site
}

export function updateFavoriteSite(id: string, data: Partial<Omit<FavoriteSite, 'id'>>): void {
  const sites = getCollection('favoriteSites')
  const idx = sites.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`常用网站 ${id} 不存在`)
  sites[idx] = { ...sites[idx], ...data }
  setCollection('favoriteSites', sites)
}

export function deleteFavoriteSite(id: string): void {
  const sites = getCollection('favoriteSites').filter((s) => s.id !== id)
  setCollection('favoriteSites', sites)
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
