import { ipcRenderer } from 'electron'
import type { ExternalAuthBrowser, ExternalAuthResult, Tab } from './types'

export function createTabApi() {
  return {
    list: (): Promise<Tab[]> => ipcRenderer.invoke('tab:list'),
    create: (pageId: string | null, url?: string, containerId?: string, workspaceId?: string, lastNonAuthUrl?: string): Promise<Tab> =>
      ipcRenderer.invoke('tab:create', pageId, url, containerId, workspaceId, lastNonAuthUrl),
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
    openAtTaskbar: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:open-at-taskbar', tabId),
    openInBrowser: (tabId: string): Promise<void> => ipcRenderer.invoke('tab:open-in-browser', tabId),
    syncExternalAuth: (
      tabId: string,
      browser: ExternalAuthBrowser,
      phase: 'start' | 'complete',
      operationId?: string
    ): Promise<ExternalAuthResult> => ipcRenderer.invoke('tab:sync-external-auth', tabId, browser, phase, operationId),
    attachWebview: (tabId: string, webContentsId: number): Promise<boolean> =>
      ipcRenderer.invoke('tab:attach-webview', tabId, webContentsId),
    listRequestedWebviews: (): Promise<Array<{ tabId: string; partition: string; userAgent: string }>> =>
      ipcRenderer.invoke('tab:list-requested-webviews'),
    capture: (tabIds: string[]): Promise<Record<string, string | null>> =>
      ipcRenderer.invoke('tab:capture', tabIds),
    updateBounds: (rect: { x: number; y: number; width: number; height: number }): void =>
      ipcRenderer.send('tab:update-bounds', rect),
    setOverlayVisible: (visible: boolean): void =>
      ipcRenderer.send('tab:set-overlay-visible', visible),
    restoreAll: (): Promise<string[]> => ipcRenderer.invoke('tab:restore-all'),
    saveAll: (tabs: Tab[]): Promise<void> => ipcRenderer.invoke('tab:save-all', tabs)
  }
}
