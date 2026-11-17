import { ipcRenderer } from 'electron'
import type { BookmarkFolder } from './types'

export function createBookmarkFolderApi() {
  return {
    list: (): Promise<BookmarkFolder[]> => ipcRenderer.invoke('bookmarkFolder:list'),
    create: (data: Omit<BookmarkFolder, 'id'>): Promise<BookmarkFolder> =>
      ipcRenderer.invoke('bookmarkFolder:create', data),
    update: (id: string, data: Partial<Omit<BookmarkFolder, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('bookmarkFolder:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('bookmarkFolder:delete', id),
    deleteEmpty: (): Promise<string[]> => ipcRenderer.invoke('bookmarkFolder:deleteEmpty'),
    reorder: (ids: string[]): Promise<void> => ipcRenderer.invoke('bookmarkFolder:reorder', ids)
  }
}
