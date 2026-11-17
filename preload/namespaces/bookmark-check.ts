import { ipcRenderer } from 'electron'

export function createBookmarkCheckApi() {
  return {
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
  }
}
