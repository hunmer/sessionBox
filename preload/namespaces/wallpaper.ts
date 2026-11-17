import { ipcRenderer } from 'electron'

export function createWallpaperApi() {
  return {
    importOpenFile: (): Promise<{ id: string; name: string } | null> =>
      ipcRenderer.invoke('wallpaper:importOpenFile'),
    list: (): Promise<{ id: string; name: string }[]> =>
      ipcRenderer.invoke('wallpaper:list'),
    delete: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('wallpaper:delete', id),
  }
}
