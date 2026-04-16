import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 类型定义（与主进程 store.ts 保持一致）
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
  icon?: string
}

// 快捷键条目
export interface ShortcutItem {
  id: string
  label: string
  accelerator: string
  global: boolean
  supportsGlobal: boolean
  defaultAccelerator: string
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

// Chat 补全参数
export interface ChatCompletionParams {
  providerId: string
  modelId: string
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
  tools?: Array<Record<string, unknown>>
  stream: boolean
  maxTokens?: number
  thinking?: { type: 'enabled'; budgetTokens: number }
  targetTabId?: string
}

// IPC API 定义
const api = {
  workspace: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke('workspace:list'),
    create: (title: string, color: string): Promise<Workspace> =>
      ipcRenderer.invoke('workspace:create', title, color),
    update: (id: string, data: Partial<Omit<Workspace, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('workspace:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workspace:delete', id),
    reorder: (workspaceIds: string[]): Promise<void> =>
      ipcRenderer.invoke('workspace:reorder', workspaceIds)
  },

  group: {
    list: (): Promise<Group[]> => ipcRenderer.invoke('group:list'),
    create: (name: string, color?: string, workspaceId?: string, proxyId?: string, icon?: string): Promise<Group> =>
      ipcRenderer.invoke('group:create', name, color, workspaceId, proxyId, icon),
    update: (id: string, data: Partial<Omit<Group, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('group:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('group:delete', id),
    reorder: (groupIds: string[]): Promise<void> =>
      ipcRenderer.invoke('group:reorder', groupIds)
  },

  container: {
    list: (): Promise<Container[]> => ipcRenderer.invoke('container:list'),
    create: (data: Omit<Container, 'id'>): Promise<Container> =>
      ipcRenderer.invoke('container:create', data),
    update: (id: string, data: Partial<Omit<Container, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('container:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('container:delete', id),
    reorder: (containerIds: string[]): Promise<void> =>
      ipcRenderer.invoke('container:reorder', containerIds),
    uploadIcon: (): Promise<string | null> => ipcRenderer.invoke('container:uploadIcon'),
    uploadIconFromUrl: (url: string): Promise<string | null> =>
      ipcRenderer.invoke('container:uploadIconFromUrl', url),
    createDesktopShortcut: (containerId: string): Promise<string> =>
      ipcRenderer.invoke('container:createDesktopShortcut', containerId)
  },

  page: {
    list: (): Promise<Page[]> => ipcRenderer.invoke('page:list'),
    create: (data: Omit<Page, 'id'>): Promise<Page> =>
      ipcRenderer.invoke('page:create', data),
    update: (id: string, data: Partial<Omit<Page, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('page:update', id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('page:delete', id),
    reorder: (pageIds: string[]): Promise<void> =>
      ipcRenderer.invoke('page:reorder', pageIds)
  },

  proxy: {
    list: (): Promise<Proxy[]> => ipcRenderer.invoke('proxy:list'),
    create: (data: Omit<Proxy, 'id'>): Promise<Proxy> =>
      ipcRenderer.invoke('proxy:create', data),
    update: (id: string, data: Partial<Omit<Proxy, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('proxy:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('proxy:delete', id),
    test: (proxyId: string): Promise<{ ok: boolean; ip?: string; error?: string }> =>
      ipcRenderer.invoke('proxy:test', proxyId),
    testConfig: (config: Omit<Proxy, 'id'>): Promise<{ ok: boolean; ip?: string; error?: string }> =>
      ipcRenderer.invoke('proxy:test-config', config)
  },

  tab: {
    list: (): Promise<Tab[]> => ipcRenderer.invoke('tab:list'),
    create: (pageId: string | null, url?: string, containerId?: string, workspaceId?: string): Promise<Tab> => ipcRenderer.invoke('tab:create', pageId, url, containerId, workspaceId),
    close: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:close', tabId),
    switch: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:switch', tabId),
    update: (tabId: string, data: Partial<Omit<Tab, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('tab:update', tabId, data),
    reorder: (tabIds: string[]): Promise<void> => ipcRenderer.invoke('tab:reorder', tabIds),
    navigate: (tabId: string, url: string): Promise<void> =>
      ipcRenderer.invoke('tab:navigate', tabId, url),
    goBack: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:goBack', tabId),
    goForward: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:goForward', tabId),
    reload: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:reload', tabId),
    forceReload: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:forceReload', tabId),
    zoomIn: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:zoomIn', tabId),
    zoomOut: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:zoomOut', tabId),
    zoomReset: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:zoomReset', tabId),
    getZoomLevel: (tabId: string): Promise<number> => ipcRenderer.invoke('tab:getZoomLevel', tabId),
    detectProxy: (tabId: string): Promise<{ ok: boolean; ip?: string; error?: string }> =>
      ipcRenderer.invoke('tab:detect-proxy', tabId),
    setProxyEnabled: (tabId: string, enabled: boolean): Promise<{ ok: boolean; enabled: boolean; error?: string }> =>
      ipcRenderer.invoke('tab:set-proxy-enabled', tabId, enabled),
    applyProxy: (tabId: string, proxyId: string | null): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('tab:apply-proxy', tabId, proxyId),
    openDevTools: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:openDevTools', tabId),
    setMuted: (tabId: string, muted: boolean): Promise<void> =>
      ipcRenderer.invoke('tab:set-muted', tabId, muted),
    openInNewWindow: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:open-in-new-window', tabId),
    openInBrowser: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:open-in-browser', tabId),
    capture: (tabIds: string[]): Promise<Record<string, string | null>> =>
      ipcRenderer.invoke('tab:capture', tabIds),
    updateBounds: (rect: { x: number; y: number; width: number; height: number }): void =>
      ipcRenderer.send('tab:update-bounds', rect),
    setOverlayVisible: (visible: boolean): void =>
      ipcRenderer.send('tab:set-overlay-visible', visible),
    restoreAll: (): Promise<string[]> => ipcRenderer.invoke('tab:restore-all'),
    saveAll: (tabs: Tab[]): Promise<void> => ipcRenderer.invoke('tab:save-all', tabs)
  },

  bookmark: {
    list: (folderId?: string): Promise<Bookmark[]> =>
      ipcRenderer.invoke('bookmark:list', folderId),
    create: (data: Omit<Bookmark, 'id'>): Promise<Bookmark> =>
      ipcRenderer.invoke('bookmark:create', data),
    update: (id: string, data: Partial<Omit<Bookmark, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('bookmark:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('bookmark:delete', id),
    batchDelete: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke('bookmark:batchDelete', ids),
    reorder: (ids: string[]): Promise<void> => ipcRenderer.invoke('bookmark:reorder', ids),
    importOpenFile: (): Promise<{ html: string } | null> =>
      ipcRenderer.invoke('bookmark:importOpenFile'),
    exportSaveFile: (html: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('bookmark:exportSaveFile', html),
    batchCreate: (
      data: {
        folders: Omit<BookmarkFolder, 'id'>[]
        bookmarks: Omit<Bookmark, 'id'>[]
      }
    ): Promise<{ folders: BookmarkFolder[]; bookmarks: Bookmark[] }> =>
      ipcRenderer.invoke('bookmark:batchCreate', data)
  },

  bookmarkFolder: {
    list: (): Promise<BookmarkFolder[]> => ipcRenderer.invoke('bookmarkFolder:list'),
    create: (data: Omit<BookmarkFolder, 'id'>): Promise<BookmarkFolder> =>
      ipcRenderer.invoke('bookmarkFolder:create', data),
    update: (id: string, data: Partial<Omit<BookmarkFolder, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('bookmarkFolder:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('bookmarkFolder:delete', id),
    deleteEmpty: (): Promise<string[]> => ipcRenderer.invoke('bookmarkFolder:deleteEmpty'),
    reorder: (ids: string[]): Promise<void> => ipcRenderer.invoke('bookmarkFolder:reorder', ids)
  },

  bookmarkCheck: {
    start: (config: {
      bookmarks: Array<{ id: string; url: string; title?: string }>
      maxRetries: number
      concurrency: number
      useProxy: boolean
      timeout: number
    }): Promise<{ taskId: string }> =>
      ipcRenderer.invoke('bookmark:checkStart', config),
    cancel: (taskId: string): Promise<void> =>
      ipcRenderer.invoke('bookmark:checkCancel', taskId)
  },

  extension: {
    list: (): Promise<Extension[]> => ipcRenderer.invoke('extension:list'),
    select: (): Promise<Extension | null> => ipcRenderer.invoke('extension:select'),
    load: (extensionId: string): Promise<void> =>
      ipcRenderer.invoke('extension:load', extensionId),
    unload: (extensionId: string): Promise<void> =>
      ipcRenderer.invoke('extension:unload', extensionId),
    delete: (extensionId: string): Promise<void> => ipcRenderer.invoke('extension:delete', extensionId),
    update: (id: string, data: Partial<Omit<Extension, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('extension:update', id, data),
    getLoaded: (): Promise<string[]> => ipcRenderer.invoke('extension:getLoaded'),
    openBrowserActionPopup: (
      containerId: string | null,
      extensionId: string,
      anchorRect: { x: number; y: number; width: number; height: number }
    ): Promise<void> => ipcRenderer.invoke('extension:openBrowserActionPopup', containerId, extensionId, anchorRect)
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    toggleFullscreen: (): Promise<void> => ipcRenderer.invoke('window:toggleFullscreen')
  },

  settings: {
    getTabFreezeMinutes: (): Promise<number> => ipcRenderer.invoke('settings:getTabFreezeMinutes'),
    setTabFreezeMinutes: (minutes: number): Promise<void> => ipcRenderer.invoke('settings:setTabFreezeMinutes', minutes),
    setDefaultBrowser: (enabled: boolean): Promise<DefaultBrowserResult> => ipcRenderer.invoke('settings:setDefaultBrowser', enabled),
    checkDefaultBrowser: (): Promise<boolean> => ipcRenderer.invoke('settings:checkDefaultBrowser'),
    getMinimizeOnClose: (): Promise<boolean> => ipcRenderer.invoke('settings:getMinimizeOnClose'),
    setMinimizeOnClose: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setMinimizeOnClose', enabled),
    getDefaultContainerId: (): Promise<string> => ipcRenderer.invoke('settings:getDefaultContainerId'),
    setDefaultContainerId: (id: string): Promise<void> => ipcRenderer.invoke('settings:setDefaultContainerId', id),
    getAskContainerOnOpen: (): Promise<boolean> => ipcRenderer.invoke('settings:getAskContainerOnOpen'),
    setAskContainerOnOpen: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setAskContainerOnOpen', enabled),
    getDefaultWorkspaceId: (): Promise<string> => ipcRenderer.invoke('settings:getDefaultWorkspaceId'),
    setDefaultWorkspaceId: (id: string): Promise<void> => ipcRenderer.invoke('settings:setDefaultWorkspaceId', id)
  },

  mutedSites: {
    list: (): Promise<string[]> => ipcRenderer.invoke('mutedSites:list'),
    set: (sites: string[]): Promise<void> => ipcRenderer.invoke('mutedSites:set', sites),
    add: (hostname: string): Promise<void> => ipcRenderer.invoke('mutedSites:add', hostname),
    remove: (hostname: string): Promise<void> => ipcRenderer.invoke('mutedSites:remove', hostname)
  },

  password: {
    list: (): Promise<PasswordEntry[]> => ipcRenderer.invoke('password:list'),
    listBySite: (siteOrigin: string): Promise<PasswordEntry[]> =>
      ipcRenderer.invoke('password:listBySite', siteOrigin),
    create: (data: Omit<PasswordEntry, 'id'>): Promise<PasswordEntry> =>
      ipcRenderer.invoke('password:create', data),
    update: (id: string, data: Partial<Omit<PasswordEntry, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('password:update', id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('password:delete', id),
    clearAll: (): Promise<void> =>
      ipcRenderer.invoke('password:clearAll'),
    importOpenFile: (): Promise<{ csv: string } | null> =>
      ipcRenderer.invoke('password:importOpenFile'),
    exportSaveFile: (csv: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('password:exportSaveFile', csv),
  },

  theme: {
    importOpenFile: (): Promise<{ json: string } | null> =>
      ipcRenderer.invoke('theme:importOpenFile'),
    exportSaveFile: (json: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('theme:exportSaveFile', json),
  },

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('openExternal', url),

  searchEngine: {
    list: (): Promise<SearchEngine[]> => ipcRenderer.invoke('searchEngine:list'),
    set: (engines: SearchEngine[]): Promise<void> => ipcRenderer.invoke('searchEngine:set', engines),
    getDefault: (): Promise<string> => ipcRenderer.invoke('searchEngine:getDefault'),
    setDefault: (id: string): Promise<void> => ipcRenderer.invoke('searchEngine:setDefault', id)
  },

  sniffer: {
    toggle: (tabId: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('sniffer:toggle', tabId, enabled),
    setDomainEnabled: (domain: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('sniffer:setDomainEnabled', domain, enabled),
    getDomainList: (): Promise<string[]> =>
      ipcRenderer.invoke('sniffer:getDomainList'),
    clearResources: (tabId: string): Promise<void> =>
      ipcRenderer.invoke('sniffer:clearResources', tabId),
    getState: (tabId: string): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke('sniffer:getState', tabId),
  },

  shortcut: {
    list: (): Promise<ShortcutItem[]> => ipcRenderer.invoke('shortcut:list'),
    update: (id: string, accelerator: string, isGlobal: boolean): Promise<{ success: boolean; error?: string; conflictId?: string }> =>
      ipcRenderer.invoke('shortcut:update', id, accelerator, isGlobal),
    clear: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('shortcut:clear', id),
    reset: (): Promise<{ success: boolean }> => ipcRenderer.invoke('shortcut:reset')
  },

  split: {
    updateMultiBounds: (paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>): void =>
      ipcRenderer.send('split:update-multi-bounds', paneBounds),
    getState: (workspaceId: string): Promise<SplitLayoutData | null> =>
      ipcRenderer.invoke('split:get-state', workspaceId),
    setState: (workspaceId: string, data: SplitLayoutData): Promise<void> =>
      ipcRenderer.invoke('split:set-state', workspaceId, data),
    clearState: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke('split:clear-state', workspaceId),
    listSchemes: (): Promise<SavedSplitSchemeData[]> =>
      ipcRenderer.invoke('split:list-schemes'),
    createScheme: (data: SavedSplitSchemeData): Promise<SavedSplitSchemeData> =>
      ipcRenderer.invoke('split:create-scheme', data),
    deleteScheme: (id: string): Promise<void> =>
      ipcRenderer.invoke('split:delete-scheme', id)
  },

  download: {
    checkConnection: (): Promise<boolean> => ipcRenderer.invoke('download:checkConnection'),
    getConfig: (): Promise<any> => ipcRenderer.invoke('download:getConfig'),
    updateConfig: (config: any): Promise<any> => ipcRenderer.invoke('download:updateConfig', config),
    start: (): Promise<boolean> => ipcRenderer.invoke('download:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('download:stop'),
    add: (url: string, options?: { filename?: string; dir?: string; headers?: string[]; cookies?: string; referer?: string }): Promise<string> =>
      ipcRenderer.invoke('download:add', url, options),
    pause: (gid: string): Promise<void> => ipcRenderer.invoke('download:pause', gid),
    resume: (gid: string): Promise<void> => ipcRenderer.invoke('download:resume', gid),
    remove: (gid: string): Promise<void> => ipcRenderer.invoke('download:remove', gid),
    listActive: (): Promise<any[]> => ipcRenderer.invoke('download:listActive'),
    listWaiting: (): Promise<any[]> => ipcRenderer.invoke('download:listWaiting'),
    listStopped: (): Promise<any[]> => ipcRenderer.invoke('download:listStopped'),
    globalStat: (): Promise<any> => ipcRenderer.invoke('download:globalStat'),
    purge: (): Promise<void> => ipcRenderer.invoke('download:purge'),
    showInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('download:showInFolder', filePath),
    getFilePath: (dir: string, filename: string): Promise<string> => ipcRenderer.invoke('download:getFilePath', dir, filename),
    startDrag: (filePath: string): void => ipcRenderer.send('download:startDrag', filePath),
    openFile: (filePath: string): Promise<void> => ipcRenderer.invoke('download:openFile', filePath),
    pickDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('download:pickDirectory', defaultPath)
  },

  chat: {
    completions: (params: ChatCompletionParams & { _requestId: string }): Promise<{ started: boolean }> =>
      ipcRenderer.invoke('chat:completions', params),
  },

  aiProvider: {
    list: (): Promise<any[]> => ipcRenderer.invoke('ai-provider:list'),
    create: (data: any): Promise<any> => ipcRenderer.invoke('ai-provider:create', data),
    update: (data: { id: string; [key: string]: any }): Promise<any> =>
      ipcRenderer.invoke('ai-provider:update', data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('ai-provider:delete', id),
    test: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ai-provider:test', id),
  },

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

  plugin: {
    list: (): Promise<PluginMeta[]> => ipcRenderer.invoke('plugin:list'),
    enable: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:enable', pluginId),
    disable: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:disable', pluginId),
    getView: (pluginId: string): Promise<string | null> => ipcRenderer.invoke('plugin:get-view', pluginId),
    getIcon: (pluginId: string): Promise<string | null> => ipcRenderer.invoke('plugin:get-icon', pluginId),
    importZip: (): Promise<{ success: boolean; pluginName?: string; error?: string }> =>
      ipcRenderer.invoke('plugin:import-zip'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('plugin:open-folder'),
    install: (url: string): Promise<{ success: boolean; pluginName?: string; error?: string }> =>
      ipcRenderer.invoke('plugin:install', url),
    uninstall: (pluginId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('plugin:uninstall', pluginId)
  },

  // 自动更新
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: (isSilent = false) => ipcRenderer.invoke('updater:install', isSilent),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    getInfo: () => ipcRenderer.invoke('updater:get-info'),
    // 更新源管理
    listSources: () => ipcRenderer.invoke('updater:list-sources'),
    getActiveSource: () => ipcRenderer.invoke('updater:get-active-source'),
    setActiveSource: (id: string) => ipcRenderer.invoke('updater:set-active-source', id),
    addSource: (source: { id: string; name: string; type: 'github' | 'generic'; url?: string; owner?: string; repo?: string }) =>
      ipcRenderer.invoke('updater:add-source', source),
    removeSource: (id: string) => ipcRenderer.invoke('updater:remove-source', id),
    updateSource: (id: string, data: { name?: string; type?: 'github' | 'generic'; url?: string; owner?: string; repo?: string }) =>
      ipcRenderer.invoke('updater:update-source', id, data),
    onChecking: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('update:checking', handler)
      return () => ipcRenderer.removeListener('update:checking', handler)
    },
    onAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, info: { version: string; releaseDate?: string; releaseNotes?: string }) => callback(info)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onNotAvailable: (callback: (info: { version: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
      ipcRenderer.on('update:not-available', handler)
      return () => ipcRenderer.removeListener('update:not-available', handler)
    },
    onDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => callback(progress)
      ipcRenderer.on('update:download-progress', handler)
      return () => ipcRenderer.removeListener('update:download-progress', handler)
    },
    onDownloaded: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, info: { version: string; releaseDate?: string; releaseNotes?: string }) => callback(info)
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onError: (callback: (error: { message: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, error: { message: string }) => callback(error)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    }
  },

  // 系统内存信息
  system: {
    memory: (): Promise<{ appMemoryKB: number; totalMemoryKB: number; freeMemoryKB: number }> =>
      ipcRenderer.invoke('system:memory')
  },

  // MCP Server
  mcp: {
    start: (): Promise<void> => ipcRenderer.invoke('mcp:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('mcp:stop'),
    getStatus: (): Promise<{ enabled: boolean; running: boolean; toolCount: number; port: number }> =>
      ipcRenderer.invoke('mcp:get-status')
  },

  // Skill 管理
  skill: {
    list: (): Promise<Array<{ name: string; description: string; created: string; updated: string }>> =>
      ipcRenderer.invoke('skill:list'),
    search: (query: string): Promise<Array<{ name: string; description: string; created: string; updated: string }>> =>
      ipcRenderer.invoke('skill:search', query),
    read: (name: string): Promise<{ name: string; description: string; content: string; updated: string } | null> =>
      ipcRenderer.invoke('skill:read', name),
    write: (name: string, description: string, content: string) =>
      ipcRenderer.invoke('skill:write', name, description, content),
    delete: (name: string): Promise<boolean> =>
      ipcRenderer.invoke('skill:delete', name),
  },

  // 主进程 → 渲染进程事件监听
  on: (event: string, callback: (...args: unknown[]) => void): (() => void) => {
    const channel = `on:${event}`
    const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

export type IpcAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
