import { ipcRenderer } from 'electron'

export function createDataApi() {
  return {
    exportSaveFile: (content: string, defaultFileName?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('data:exportSaveFile', content, defaultFileName),
  }
}
