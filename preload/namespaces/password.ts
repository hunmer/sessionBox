import { ipcRenderer } from 'electron'
import type { PasswordEntry } from './types'

export function createPasswordApi() {
  return {
    list: (): Promise<PasswordEntry[]> => ipcRenderer.invoke('password:list'),
    listBySite: (siteOrigin: string): Promise<PasswordEntry[]> =>
      ipcRenderer.invoke('password:listBySite', siteOrigin),
    create: (data: Omit<PasswordEntry, 'id'>): Promise<PasswordEntry> =>
      ipcRenderer.invoke('password:create', data),
    update: (id: string, data: Partial<Omit<PasswordEntry, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('password:update', id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('password:delete', id),
    clearAll: (): Promise<void> =>
      ipcRenderer.invoke('password:clearAll'),
    importOpenFile: (): Promise<{ csv: string } | null> =>
      ipcRenderer.invoke('password:importOpenFile'),
    exportSaveFile: (csv: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('password:exportSaveFile', csv),
  }
}
