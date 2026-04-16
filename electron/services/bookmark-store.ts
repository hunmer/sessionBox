import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { JsonStore } from '../utils/json-store'
import { pluginEventBus } from './plugin-event-bus'
import type { Bookmark, BookmarkFolder } from './store'

interface BookmarkStoreData {
  bookmarks: Bookmark[]
  bookmarkFolders: BookmarkFolder[]
}

const defaults: BookmarkStoreData = {
  bookmarks: [],
  bookmarkFolders: [],
}

export const bookmarkStore = new JsonStore<BookmarkStoreData>(
  join(app.getPath('userData'), 'bookmark-store.json'),
  defaults
)

// ====== 书签操作 ======

export function listBookmarks(folderId?: string): Bookmark[] {
  const sites = bookmarkStore.get('bookmarks') ?? defaults.bookmarks
  const sorted = [...sites].sort((a, b) => a.order - b.order)
  if (folderId) return sorted.filter((s) => s.folderId === folderId)
  return sorted
}

export function createBookmark(data: Omit<Bookmark, 'id'>): Bookmark {
  const sites = bookmarkStore.get('bookmarks') ?? []
  const site: Bookmark = { ...data, id: randomUUID() }
  sites.push(site)
  bookmarkStore.set('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:created', site) } catch {}
  return site
}

export function updateBookmark(id: string, data: Partial<Omit<Bookmark, 'id'>>): void {
  const sites = bookmarkStore.get('bookmarks') ?? []
  const idx = sites.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`书签 ${id} 不存在`)
  sites[idx] = { ...sites[idx], ...data }
  bookmarkStore.set('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:updated', { id, ...data }) } catch {}
}

export function deleteBookmark(id: string): void {
  const sites = (bookmarkStore.get('bookmarks') ?? []).filter((s) => s.id !== id)
  bookmarkStore.set('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:deleted', id) } catch {}
}

export function batchDeleteBookmarks(ids: string[]): void {
  const idSet = new Set(ids)
  const sites = (bookmarkStore.get('bookmarks') ?? []).filter((s) => !idSet.has(s.id))
  bookmarkStore.set('bookmarks', sites)
  try { pluginEventBus.emit('bookmark:batch-deleted', ids) } catch {}
}

export function reorderBookmarks(ids: string[]): void {
  const sites = bookmarkStore.get('bookmarks') ?? []
  ids.forEach((id, order) => {
    const s = sites.find((s) => s.id === id)
    if (s) s.order = order
  })
  bookmarkStore.set('bookmarks', sites)
}

export function batchCreateBookmarks(items: Omit<Bookmark, 'id'>[]): Bookmark[] {
  const sites = bookmarkStore.get('bookmarks') ?? []
  const created: Bookmark[] = []
  for (const data of items) {
    const bookmark: Bookmark = { ...data, id: randomUUID() }
    sites.push(bookmark)
    created.push(bookmark)
  }
  bookmarkStore.set('bookmarks', sites)
  return created
}

// ====== 书签文件夹操作 ======

export function listBookmarkFolders(): BookmarkFolder[] {
  const folders = bookmarkStore.get('bookmarkFolders') ?? defaults.bookmarkFolders
  return [...folders].sort((a, b) => a.order - b.order)
}

export function createBookmarkFolder(data: Omit<BookmarkFolder, 'id'>): BookmarkFolder {
  const folders = bookmarkStore.get('bookmarkFolders') ?? []
  const folder: BookmarkFolder = { ...data, id: randomUUID() }
  folders.push(folder)
  bookmarkStore.set('bookmarkFolders', folders)
  try { pluginEventBus.emit('bookmark-folder:created', folder) } catch {}
  return folder
}

export function updateBookmarkFolder(id: string, data: Partial<Omit<BookmarkFolder, 'id'>>): void {
  const folders = bookmarkStore.get('bookmarkFolders') ?? []
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error(`文件夹 ${id} 不存在`)
  folders[idx] = { ...folders[idx], ...data }
  bookmarkStore.set('bookmarkFolders', folders)
  try { pluginEventBus.emit('bookmark-folder:updated', { id, ...data }) } catch {}
}

export function deleteBookmarkFolder(id: string): void {
  const folders = bookmarkStore.get('bookmarkFolders') ?? []
  const childIds = collectChildFolderIds(folders, id)
  const idsToDelete = [id, ...childIds]
  bookmarkStore.set('bookmarkFolders', folders.filter((f) => !idsToDelete.includes(f.id)))
  const sites = (bookmarkStore.get('bookmarks') ?? []).filter((s) => !idsToDelete.includes(s.folderId))
  bookmarkStore.set('bookmarks', sites)
  try { pluginEventBus.emit('bookmark-folder:deleted', id) } catch {}
}

export function deleteEmptyBookmarkFolders(): string[] {
  const folders = bookmarkStore.get('bookmarkFolders') ?? []
  const bookmarks = bookmarkStore.get('bookmarks') ?? []

  const emptyIds = new Set<string>()
  for (const folder of folders) {
    const hasChildFolders = folders.some((f) => f.parentId === folder.id && !emptyIds.has(f.id))
    const hasBookmarks = bookmarks.some((b) => b.folderId === folder.id)
    if (!hasChildFolders && !hasBookmarks) {
      emptyIds.add(folder.id)
    }
  }

  if (emptyIds.size === 0) return []

  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (emptyIds.has(folder.id)) continue
      const hasChildFolders = folders.some((f) => f.parentId === folder.id && !emptyIds.has(f.id))
      const hasBookmarks = bookmarks.some((b) => b.folderId === folder.id)
      if (!hasChildFolders && !hasBookmarks) {
        emptyIds.add(folder.id)
        changed = true
      }
    }
  }

  bookmarkStore.set(
    'bookmarkFolders',
    folders.filter((f) => !emptyIds.has(f.id))
  )
  return [...emptyIds]
}

export function reorderBookmarkFolders(ids: string[]): void {
  const folders = bookmarkStore.get('bookmarkFolders') ?? []
  ids.forEach((id, order) => {
    const f = folders.find((f) => f.id === id)
    if (f) f.order = order
  })
  bookmarkStore.set('bookmarkFolders', folders)
}

export function batchCreateBookmarkFolders(items: Omit<BookmarkFolder, 'id'>[]): BookmarkFolder[] {
  const folders = bookmarkStore.get('bookmarkFolders') ?? []
  const created: BookmarkFolder[] = []
  for (const data of items) {
    const folder: BookmarkFolder = { ...data, id: randomUUID() }
    folders.push(folder)
    created.push(folder)
  }
  bookmarkStore.set('bookmarkFolders', folders)
  return created
}

function collectChildFolderIds(folders: BookmarkFolder[], parentId: string): string[] {
  const children = folders.filter((f) => f.parentId === parentId)
  const ids: string[] = []
  for (const child of children) {
    ids.push(child.id)
    ids.push(...collectChildFolderIds(folders, child.id))
  }
  return ids
}
