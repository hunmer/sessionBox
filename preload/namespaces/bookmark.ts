import { ipcRenderer } from 'electron'
import type { Bookmark, BookmarkFolder } from './types'

export function createBookmarkApi() {
  return {
    list: (folderId?: string): Promise<Bookmark[]> =>
      ipcRenderer.invoke('bookmark:list', folderId),
    create: (data: Omit<Bookmark, 'id'>): Promise<Bookmark> =>
      ipcRenderer.invoke('bookmark:create', data),
    update: (id: string, data: Partial<Omit<Bookmark, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('bookmark:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('bookmark:delete', id),
    batchDelete: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke('bookmark:batchDelete', ids),
    reorder: (ids: string[]): Promise<void> => ipcRenderer.invoke('bookmark:reorder', ids),
    importOpenFile: (): Promise<{ html: string } | null> =>
      ipcRenderer.invoke('bookmark:importOpenFile'),
    exportSaveFile: (html: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('bookmark:exportSaveFile', html),
    batchCreate: (
      data: {
        folders: Omit<BookmarkFolder, 'id'>[]
        bookmarks: Omit<Bookmark, 'id'>[]
      }
    ): Promise<{ folders: BookmarkFolder[]; bookmarks: Bookmark[] }> =>
      ipcRenderer.invoke('bookmark:batchCreate', data)
  }
}
