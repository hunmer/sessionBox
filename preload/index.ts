import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { createWorkspaceApi } from './namespaces/workspace'
import { createGroupApi } from './namespaces/group'
import { createContainerApi } from './namespaces/container'
import { createPageApi } from './namespaces/page'
import { createProxyApi } from './namespaces/proxy'
import { createTabApi } from './namespaces/tab'
import { createBookmarkApi } from './namespaces/bookmark'
import { createBookmarkFolderApi } from './namespaces/bookmark-folder'
import { createBookmarkCheckApi } from './namespaces/bookmark-check'
import { createExtensionApi } from './namespaces/extension'
import { createWindowApi } from './namespaces/window'
import { createSettingsApi } from './namespaces/settings'
import { createMutedSitesApi } from './namespaces/muted-sites'
import { createPasswordApi } from './namespaces/password'
import { createThemeApi } from './namespaces/theme'
import { createWallpaperApi } from './namespaces/wallpaper'
import { createSearchEngineApi } from './namespaces/search-engine'
import { createSiteDataApi } from './namespaces/site-data'
import { createSyncApi } from './namespaces/sync'
import { createDataApi } from './namespaces/data'
import { createSnifferApi } from './namespaces/sniffer'
import { createShortcutApi } from './namespaces/shortcut'
import { createSplitApi } from './namespaces/split'
import { createDownloadApi } from './namespaces/download'
import { createChatApi } from './namespaces/chat'
import { createAiProviderApi } from './namespaces/ai-provider'
import { createBrowserApi } from './namespaces/browser'
import { createPluginApi } from './namespaces/plugin'
import { createUpdaterApi } from './namespaces/updater'
import { createSystemApi } from './namespaces/system'
import { createMcpApi } from './namespaces/mcp'
import { createAgentApi } from './namespaces/agent'
import { createSkillApi } from './namespaces/skill'
import { createDebuggerApi } from './namespaces/debugger'
import { createProfileApi } from './namespaces/profile'

// 类型 re-export（定义已迁移至 namespaces/types.ts，外部导入路径 preload/index 不变）
export type {
  Proxy,
  SiteDataInfo,
  Workspace,
  Group,
  Container,
  Page,
  Tab,
  NavState,
  BookmarkFolder,
  Bookmark,
  PasswordField,
  PasswordEntry,
  Extension,
  ExtensionDownloadProgress,
  ShortcutItem,
  ShortcutGroup,
  PluginMeta,
  SearchEngine,
  SplitPaneData,
  SplitNodeData,
  SplitLayoutData,
  SavedSplitSchemeData,
  DefaultBrowserResult,
  TabImplementation,
  SyncTypes,
  SyncConfig,
  SyncCookie,
  ExternalAuthBrowser,
  ExternalAuthResult,
  ChatCompletionParams
} from './namespaces/types'

// IPC API 定义：各命名空间工厂聚合（键顺序与拆分前一致）
const api = {
  workspace: createWorkspaceApi(),
  group: createGroupApi(),
  container: createContainerApi(),
  page: createPageApi(),
  proxy: createProxyApi(),
  tab: createTabApi(),
  bookmark: createBookmarkApi(),
  bookmarkFolder: createBookmarkFolderApi(),
  bookmarkCheck: createBookmarkCheckApi(),
  extension: createExtensionApi(),
  window: createWindowApi(),
  settings: createSettingsApi(),
  mutedSites: createMutedSitesApi(),
  password: createPasswordApi(),
  theme: createThemeApi(),
  wallpaper: createWallpaperApi(),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('openExternal', url),
  searchEngine: createSearchEngineApi(),
  siteData: createSiteDataApi(),
  sync: createSyncApi(),
  data: createDataApi(),
  sniffer: createSnifferApi(),
  shortcut: createShortcutApi(),
  split: createSplitApi(),
  download: createDownloadApi(),
  chat: createChatApi(),
  aiProvider: createAiProviderApi(),
  browser: createBrowserApi(),
  plugin: createPluginApi(),
  updater: createUpdaterApi(),
  system: createSystemApi(),
  mcp: createMcpApi(),
  agent: createAgentApi(),
  skill: createSkillApi(),
  debugger: createDebuggerApi(),
  profile: createProfileApi(),

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
  const globalWindow = globalThis as typeof globalThis & { api: IpcAPI; electron: typeof electronAPI }
  globalWindow.electron = electronAPI
  globalWindow.api = api
}
