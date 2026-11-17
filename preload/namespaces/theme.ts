import { ipcRenderer } from 'electron'

export function createThemeApi() {
  return {
    importOpenFile: (): Promise<{ json: string } | null> =>
      ipcRenderer.invoke('theme:importOpenFile'),
    exportSaveFile: (json: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('theme:exportSaveFile', json),
    setNativeTheme: (source: 'system' | 'light' | 'dark'): Promise<boolean> =>
      ipcRenderer.invoke('theme:setNativeTheme', source),
    getNativeTheme: (): Promise<{ source: 'system' | 'light' | 'dark'; isDark: boolean }> =>
      ipcRenderer.invoke('theme:getNativeTheme'),
  }
}
