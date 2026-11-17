import { ipcRenderer } from 'electron'
import type {
  Bookmark,
  BookmarkFolder,
  Container,
  Proxy,
  SyncConfig,
  SyncCookie
} from './types'

export function createSyncApi() {
  return {
    getConfig: (): Promise<SyncConfig> => ipcRenderer.invoke('sync:getConfig'),
    setConfig: (config: SyncConfig): Promise<SyncConfig> => ipcRenderer.invoke('sync:setConfig', config),
    testConnection: (serverUrl: string): Promise<{ ok: boolean; version?: number; serverTime?: number; error?: string }> =>
      ipcRenderer.invoke('sync:testConnection', serverUrl),
    getContainerCookies: (containerId: string): Promise<SyncCookie[]> =>
      ipcRenderer.invoke('sync:getContainerCookies', containerId),
    setContainerCookies: (
      containerId: string,
      cookies: SyncCookie[]
    ): Promise<{ applied: number; skipped: number }> =>
      ipcRenderer.invoke('sync:setContainerCookies', containerId, cookies),
    applyContainers: (items: Container[]): Promise<{ created: number; updated: number }> =>
      ipcRenderer.invoke('sync:applyContainers', items),
    applyProxies: (items: Proxy[]): Promise<{ created: number; updated: number }> =>
      ipcRenderer.invoke('sync:applyProxies', items),
    applyBookmarks: (data: {
      folders: BookmarkFolder[]
      bookmarks: Bookmark[]
    }): Promise<{ folders: { created: number; updated: number }; bookmarks: { created: number; updated: number } }> =>
      ipcRenderer.invoke('sync:applyBookmarks', data),
  }
}
