import { ipcRenderer } from 'electron'

// 自动更新
export function createUpdaterApi() {
  return {
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
  }
}
