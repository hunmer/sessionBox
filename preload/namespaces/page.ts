import { ipcRenderer } from 'electron'
import type { Page } from './types'

export function createPageApi() {
  return {
    list: (): Promise<Page[]> => ipcRenderer.invoke('page:list'),
    create: (data: Omit<Page, 'id'>): Promise<Page> =>
      ipcRenderer.invoke('page:create', data),
    update: (id: string, data: Partial<Omit<Page, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('page:update', id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('page:delete', id),
    reorder: (pageIds: string[]): Promise<void> =>
      ipcRenderer.invoke('page:reorder', pageIds),
    createDesktopShortcut: (pageId: string, mode: 'app' | 'window' | 'taskbar-desktop' | 'taskbar-mobile'): Promise<string> =>
      ipcRenderer.invoke('page:createDesktopShortcut', pageId, mode)
  }
}
