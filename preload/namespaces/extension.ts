import { ipcRenderer } from 'electron'
import type { Extension, ExtensionDownloadProgress } from './types'

export function createExtensionApi() {
  return {
    list: (): Promise<Extension[]> => ipcRenderer.invoke('extension:list'),
    select: (): Promise<Extension | null> => ipcRenderer.invoke('extension:select'),
    installFromWebStore: async (
      url: string,
      onProgress?: (progress: ExtensionDownloadProgress) => void
    ): Promise<Extension> => {
      if (!onProgress) return ipcRenderer.invoke('extension:installFromWebStore', url)
      const requestId = crypto.randomUUID()
      const listener = (_event: Electron.IpcRendererEvent, data: ExtensionDownloadProgress & { requestId: string }) => {
        if (data.requestId === requestId) onProgress({ received: data.received, total: data.total })
      }
      ipcRenderer.on('extension:download-progress', listener)
      try {
        return await ipcRenderer.invoke('extension:installFromWebStore', url, requestId)
      } finally {
        ipcRenderer.removeListener('extension:download-progress', listener)
      }
    },
    restartForUserScripts: (): Promise<void> => ipcRenderer.invoke('extension:restartForUserScripts'),
    load: (extensionId: string): Promise<void> =>
      ipcRenderer.invoke('extension:load', extensionId),
    unload: (extensionId: string): Promise<void> =>
      ipcRenderer.invoke('extension:unload', extensionId),
    delete: (extensionId: string): Promise<void> => ipcRenderer.invoke('extension:delete', extensionId),
    update: (id: string, data: Partial<Omit<Extension, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('extension:update', id, data),
    getLoaded: (): Promise<string[]> => ipcRenderer.invoke('extension:getLoaded'),
    getBrowserActionState: (): Promise<{ activeTabId?: number; actions: any[] }> =>
      ipcRenderer.invoke('extension:getBrowserActionState'),
    onBrowserActionUpdate: (listener: () => void): (() => void) => {
      const wrapped = () => listener()
      ipcRenderer.on('extension:browser-action-update', wrapped)
      return () => ipcRenderer.removeListener('extension:browser-action-update', wrapped)
    },
    openBrowserActionPopup: (
      extensionId: string,
      anchorRect: { x: number; y: number; width: number; height: number; alignment?: string }
    ): Promise<void> => ipcRenderer.invoke('extension:openBrowserActionPopup', extensionId, anchorRect),
    completeTabCreate: (
      requestId: string,
      result: { tabId?: string; error?: string }
    ): Promise<boolean> => ipcRenderer.invoke('extension:complete-tab-create', requestId, result)
  }
}
