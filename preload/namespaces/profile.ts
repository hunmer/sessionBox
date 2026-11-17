import { ipcRenderer } from 'electron'

// Profile 多环境管理（每个 profile 以独立 userData 目录的独立进程运行）
export function createProfileApi() {
  return {
    list: (): Promise<Array<{ id: string; name: string; createdAt: number; lastUsedAt?: number }>> =>
      ipcRenderer.invoke('profile:list'),
    create: (name: string): Promise<{ id: string; name: string; createdAt: number }> =>
      ipcRenderer.invoke('profile:create', name),
    current: (): Promise<{ id: string; name: string }> => ipcRenderer.invoke('profile:current'),
    launch: (profileId: string): Promise<{ launched: boolean }> => ipcRenderer.invoke('profile:launch', profileId),
    createDesktopShortcut: (profileId: string): Promise<string> =>
      ipcRenderer.invoke('profile:create-desktop-shortcut', profileId),
    openSelector: (): Promise<boolean> => ipcRenderer.invoke('profile:open-selector')
  }
}
