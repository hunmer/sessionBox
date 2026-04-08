import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 类型定义（与主进程 store.ts 保持一致）
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

export interface NavState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

export interface FavoriteSite {
  id: string
  title: string
  url: string
}

// IPC API 定义
const api = {
  group: {
    list: (): Promise<Group[]> => ipcRenderer.invoke('group:list'),
    create: (name: string): Promise<Group> => ipcRenderer.invoke('group:create', name),
    update: (id: string, data: Partial<Omit<Group, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('group:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('group:delete', id),
    reorder: (groupIds: string[]): Promise<void> =>
      ipcRenderer.invoke('group:reorder', groupIds)
  },

  account: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('account:list'),
    create: (data: Omit<Account, 'id'>): Promise<Account> =>
      ipcRenderer.invoke('account:create', data),
    update: (id: string, data: Partial<Omit<Account, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('account:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('account:delete', id),
    uploadIcon: (): Promise<string | null> => ipcRenderer.invoke('account:uploadIcon')
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
    create: (accountId: string, url?: string): Promise<Tab> => ipcRenderer.invoke('tab:create', accountId, url),
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
    updateBounds: (rect: { x: number; y: number; width: number; height: number }): void =>
      ipcRenderer.send('tab:update-bounds', rect),
    setOverlayVisible: (visible: boolean): void =>
      ipcRenderer.send('tab:set-overlay-visible', visible),
    restoreAll: (): Promise<string[]> => ipcRenderer.invoke('tab:restore-all'),
    saveAll: (tabs: Tab[]): Promise<void> => ipcRenderer.invoke('tab:save-all', tabs)
  },

  favoriteSite: {
    list: (): Promise<FavoriteSite[]> => ipcRenderer.invoke('favoriteSite:list'),
    create: (data: Omit<FavoriteSite, 'id'>): Promise<FavoriteSite> =>
      ipcRenderer.invoke('favoriteSite:create', data),
    update: (id: string, data: Partial<Omit<FavoriteSite, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('favoriteSite:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('favoriteSite:delete', id)
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized')
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
