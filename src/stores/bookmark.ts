import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Bookmark, BookmarkFolder } from '../types'

const api = window.api

export const useBookmarkStore = defineStore('bookmark', () => {
  // ====== 状态 ======
  const folders = ref<BookmarkFolder[]>([])
  const bookmarks = ref<Bookmark[]>([])

  // ====== 计算属性 ======

  /** 书签栏文件夹的书签（用于 BookmarkBar） */
  const toolbarBookmarks = computed(() =>
    bookmarks.value.filter((b) => b.folderId === '__bookmark_bar__').sort((a, b) => a.order - b.order)
  )

  /** 根级文件夹 */
  const rootFolders = computed(() =>
    folders.value.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order)
  )

  // ====== 文件夹操作 ======

  async function loadFolders() {
    folders.value = await api.bookmarkFolder.list()
  }

  async function createFolder(data: Omit<BookmarkFolder, 'id'>) {
    const folder = await api.bookmarkFolder.create(data)
    folders.value.push(folder)
    return folder
  }

  async function updateFolder(id: string, data: Partial<Omit<BookmarkFolder, 'id'>>) {
    await api.bookmarkFolder.update(id, data)
    const idx = folders.value.findIndex((f) => f.id === id)
    if (idx !== -1) folders.value[idx] = { ...folders.value[idx], ...data }
  }

  async function deleteFolder(id: string) {
    await api.bookmarkFolder.delete(id)
    folders.value = folders.value.filter((f) => f.id !== id)
    // 级联删除相关书签
    bookmarks.value = bookmarks.value.filter((b) => b.folderId !== id)
  }

  async function reorderFolders(ids: string[]) {
    await api.bookmarkFolder.reorder(ids)
    ids.forEach((id, order) => {
      const f = folders.value.find((f) => f.id === id)
      if (f) f.order = order
    })
  }

  /** 获取指定文件夹的子文件夹 */
  function getChildFolders(parentId: string): BookmarkFolder[] {
    return folders.value.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)
  }

  // ====== 书签操作 ======

  async function loadBookmarks() {
    bookmarks.value = await api.bookmark.list()
  }

  async function createBookmark(data: Omit<Bookmark, 'id'>) {
    const bookmark = await api.bookmark.create(data)
    bookmarks.value.push(bookmark)
    return bookmark
  }

  async function updateBookmark(id: string, data: Partial<Omit<Bookmark, 'id'>>) {
    await api.bookmark.update(id, data)
    const idx = bookmarks.value.findIndex((b) => b.id === id)
    if (idx !== -1) bookmarks.value[idx] = { ...bookmarks.value[idx], ...data }
  }

  async function deleteBookmark(id: string) {
    await api.bookmark.delete(id)
    bookmarks.value = bookmarks.value.filter((b) => b.id !== id)
  }

  async function reorderBookmarks(ids: string[]) {
    await api.bookmark.reorder(ids)
    ids.forEach((id, order) => {
      const b = bookmarks.value.find((b) => b.id === id)
      if (b) b.order = order
    })
  }

  /** 获取指定文件夹的书签 */
  function getBookmarksByFolder(folderId: string): Bookmark[] {
    return bookmarks.value.filter((b) => b.folderId === folderId).sort((a, b) => a.order - b.order)
  }

  /** 检查 URL 是否已收藏 */
  function isBookmarked(url: string): boolean {
    return bookmarks.value.some((b) => b.url === url)
  }

  /** 查找 URL 对应的书签 */
  function findBookmarkByUrl(url: string): Bookmark | undefined {
    return bookmarks.value.find((b) => b.url === url)
  }

  // ====== 初始化 ======

  async function init() {
    await Promise.all([loadFolders(), loadBookmarks()])
  }

  return {
    folders,
    bookmarks,
    toolbarBookmarks,
    rootFolders,
    loadFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    reorderFolders,
    getChildFolders,
    loadBookmarks,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    reorderBookmarks,
    getBookmarksByFolder,
    isBookmarked,
    findBookmarkByUrl,
    init
  }
})
