import { ipcRenderer } from 'electron'
import type { SiteDataInfo } from './types'

export function createSiteDataApi() {
  return {
    getInfo: (tabId: string): Promise<SiteDataInfo> => ipcRenderer.invoke('siteData:getInfo', tabId),
    clear: (tabId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('siteData:clear', tabId),
    importCookies: (tabId: string, cookieText: string): Promise<{ success: boolean; count: number; skipped: number }> =>
      ipcRenderer.invoke('siteData:importCookies', tabId, cookieText),
    exportCookies: (
      tabId: string,
      format: 'netscape' | 'json' | 'header',
    ): Promise<{ success: boolean; count: number; path?: string; error?: string }> =>
      ipcRenderer.invoke('siteData:exportCookies', tabId, format),
  }
}
