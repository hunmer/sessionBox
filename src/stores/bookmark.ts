import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Bookmark, BookmarkFolder } from '../types'

const api = window.api

// ====== HTML 转义工具函数 ======

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ====== 书签导入辅助函数 ======

/** 解析 Chrome/Netscape 书签 HTML，返回待创建的文件夹和书签 */
function parseBookmarkHTML(
  html: string,
  folders: BookmarkFolder[],
  bookmarks: Bookmark[]
): {
  folders: Omit<BookmarkFolder, 'id'>[]
  bookmarks: Omit<Bookmark, 'id'>[]
} {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const rootDL = doc.querySelector('DL')
  if (!rootDL) return { folders: [], bookmarks: [] }

  const pendingFolders: Omit<BookmarkFolder, 'id'>[] = []
  const pendingBookmarks: Omit<Bookmark, 'id'>[] = []
  // Chrome 文件夹名 → SessionBox folderId 的映射
  const chromeFolderMap = new Map<string, string>()

  function walk(dl: Element, parentFolderId: string | null, folderOrder: { value: number }) {
    const dts = dl.querySelectorAll(':scope > DT')
    for (const dt of dts) {
      const h3 = dt.querySelector(':scope > H3')
      if (h3) {
        // 这是一个文件夹
        const folderName = h3.textContent?.trim() || '未命名文件夹'
        const existingFolder = folders.find(
          (f) => f.name === folderName && f.parentId === parentFolderId
        )
        if (existingFolder) {
          chromeFolderMap.set(h3.textContent ?? folderName, existingFolder.id)
        } else {
          const folderData: Omit<BookmarkFolder, 'id'> = {
            name: folderName,
            parentId: parentFolderId,
            order: folderOrder.value++
          }
          pendingFolders.push(folderData)
          // 用临时 key 映射，后续 batchCreate 后更新
          chromeFolderMap.set(h3.textContent ?? folderName, `__pending_${pendingFolders.length}`)
        }

        // 处理子 DL
        const childDL = dt.querySelector(':scope > DL')
        if (childDL) {
          walk(childDL, chromeFolderMap.get(h3.textContent ?? folderName)!, { value: 0 })
        }
        continue
      }

      const a = dt.querySelector(':scope > A')
      if (a) {
        const url = a.getAttribute('HREF') || ''
        const title = a.textContent?.trim() || url
        if (!url || url.startsWith('javascript:') || url.startsWith('place:')) continue
        // 同文件夹下 URL 去重
        if (bookmarks.some((b) => b.url === url && b.folderId === parentFolderId)) continue
        if (pendingBookmarks.some((b) => b.url === url && b.folderId === parentFolderId)) continue

        pendingBookmarks.push({
          title,
          url,
          folderId: parentFolderId,
          order: pendingBookmarks.filter((b) => b.folderId === parentFolderId).length
        })
      }
    }
  }

  walk(rootDL, null, { value: 0 })
  return { folders: pendingFolders, bookmarks: pendingBookmarks }
}

/** 导入 Chrome 书签 HTML 文件的核心逻辑 */
async function executeImportBookmarks(
  folders: BookmarkFolder[],
  bookmarks: Bookmark[]
): Promise<{ folderCount: number; bookmarkCount: number; createdFolders: BookmarkFolder[]; createdBookmarks: Bookmark[] }> {
  const result = await api.bookmark.importOpenFile()
  if (!result) return { folderCount: 0, bookmarkCount: 0, createdFolders: [], createdBookmarks: [] }

  const { folders: pendingFolders, bookmarks: pendingBookmarks } = parseBookmarkHTML(result.html, folders, bookmarks)
  if (pendingFolders.length === 0 && pendingBookmarks.length === 0) {
    return { folderCount: 0, bookmarkCount: 0, createdFolders: [], createdBookmarks: [] }
  }

  // 先批量创建文件夹，建立 ID 映射
  let folderIndex = 0
  for (const _ of pendingFolders) {
    folderIndex++
  }

  const created = await api.bookmark.batchCreate({ folders: pendingFolders, bookmarks: [] })

  // 建立新文件夹 ID 映射，处理父子关系
  const pendingIdMap = new Map<string, string>()
  for (let i = 0; i < created.folders.length; i++) {
    pendingIdMap.set(`__pending_${i + 1}`, created.folders[i].id)
  }

  // 更新待创建书签的 folderId（将 __pending_ 替换为真实 ID）
  const fixedBookmarks: Omit<Bookmark, 'id'>[] = pendingBookmarks.map((b) => ({
    ...b,
    folderId: pendingIdMap.get(b.folderId) || b.folderId
  }))

  // 更新文件夹的父子关系（batchCreate 创建的文件夹 parentId 可能仍是 __pending_）
  for (const createdFolder of created.folders) {
    if (createdFolder.parentId?.startsWith('__pending_')) {
      const realParentId = pendingIdMap.get(createdFolder.parentId)
      if (realParentId) {
        await api.bookmarkFolder.update(createdFolder.id, { parentId: realParentId })
        createdFolder.parentId = realParentId
      }
    }
  }

  // 再批量创建书签
  const bookmarkResult = await api.bookmark.batchCreate({ folders: [], bookmarks: fixedBookmarks })

  return {
    folderCount: created.folders.length,
    bookmarkCount: bookmarkResult.bookmarks.length,
    createdFolders: created.folders,
    createdBookmarks: bookmarkResult.bookmarks
  }
}

/** 通用移动逻辑：同容器内重排，跨容器时更新关系并重排 */
async function moveItemInContainer<T extends { id: string }>(
  itemId: string,
  oldContainerId: string | null,
  targetContainerId: string | null,
  targetIndex: number,
  items: T[],
  getSiblings: (containerId: string | null) => T[],
  updateItemContainer: (id: string, containerId: string | null) => Promise<void>,
  reorderSiblings: (ids: string[]) => Promise<void>
) {
  const item = items.find((x) => x.id === itemId)
  if (!item) return

  // 同容器下移动，直接重排
  if (oldContainerId === targetContainerId) {
    const siblings = getSiblings(oldContainerId)
    const reordered = siblings.filter((x) => x.id !== itemId)
    reordered.splice(targetIndex, 0, item)
    await reorderSiblings(reordered.map((x) => x.id))
    return
  }

  // 跨容器移动：先更新关系
  await updateItemContainer(itemId, targetContainerId)

  // 在旧容器下重排剩余项
  const oldSiblings = getSiblings(oldContainerId)
  if (oldSiblings.length > 0) {
    await reorderSiblings(oldSiblings.map((x) => x.id))
  }

  // 在新容器下插入并重排
  const newSiblings = getSiblings(targetContainerId)
  const reordered = newSiblings.filter((x) => x.id !== itemId)
  reordered.splice(targetIndex, 0, item)
  await reorderSiblings(reordered.map((x) => x.id))
}

// ====== 书签导出辅助函数 ======

function renderFolderToHTML(folder: BookmarkFolder, lines: string[], depth: number, folders: BookmarkFolder[], bookmarks: Bookmark[]) {
  const indent = '    '.repeat(depth)
  lines.push(`${indent}<DT><H3>${escapeText(folder.name)}</H3>`)
  lines.push(`${indent}<DL><p>`)

  const childFolders = folders
    .filter((f) => f.parentId === folder.id)
    .sort((a, b) => a.order - b.order)

  const childBookmarks = bookmarks
    .filter((b) => b.folderId === folder.id)
    .sort((a, b) => a.order - b.order)

  for (const child of childFolders) {
    renderFolderToHTML(child, lines, depth + 1, folders, bookmarks)
  }

  for (const bm of childBookmarks) {
    lines.push(
      `${indent}    <DT><A HREF="${escapeAttr(bm.url)}">${escapeText(bm.title)}</A>`
    )
  }

  lines.push(`${indent}</DL><p>`)
}

/** 生成 Netscape 书签 HTML */
function generateBookmarkHTML(folders: BookmarkFolder[], bookmarks: Bookmark[]): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ]

  const rootItems = folders
    .filter((f) => f.parentId === null)
    .sort((a, b) => a.order - b.order)

  for (const rootFolder of rootItems) {
    renderFolderToHTML(rootFolder, lines, 1, folders, bookmarks)
  }

  // 根级无文件夹的书签（理论上不存在，但兜底）
  const rootBookmarks = bookmarks
    .filter((b) => !folders.some((f) => f.id === b.folderId))
    .sort((a, b) => a.order - b.order)
  for (const bm of rootBookmarks) {
    lines.push(`        <DT><A HREF="${escapeAttr(bm.url)}">${escapeText(bm.title)}</A>`)
  }

  lines.push('</DL><p>')
  return lines.join('\n')
}

export const useBookmarkStore = defineStore('bookmark', () => {
  // ====== 状态 ======
  const folders = ref<BookmarkFolder[]>([])
  const bookmarks = ref<Bookmark[]>([])

  // ====== 计算属性 ======

  /** 根级文件夹 */
  const rootFolders = computed(() =>
    folders.value.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order)
  )

  /** 书签栏统一列表：所有根级文件夹（第一层），点击展开查看内部书签和子文件夹 */
  const toolbarItems = computed(() =>
    rootFolders.value.map((f) => ({ type: 'folder' as const, data: f, order: f.order }))
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

  /** 删除所有空文件夹（无书签且无子文件夹），返回被删除的文件夹 ID */
  async function deleteEmptyFolders(): Promise<string[]> {
    const deletedIds = await api.bookmarkFolder.deleteEmpty()
    if (deletedIds.length > 0) {
      const idSet = new Set(deletedIds)
      folders.value = folders.value.filter((f) => !idSet.has(f.id))
    }
    return deletedIds
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

  async function batchDeleteBookmarks(ids: string[]) {
    await api.bookmark.batchDelete(ids)
    const idSet = new Set(ids)
    bookmarks.value = bookmarks.value.filter((b) => !idSet.has(b.id))
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

  // ====== 移动操作 ======

  /** 移动文件夹到新的父级下指定位置 */
  async function moveFolder(folderId: string, targetParentId: string | null, targetIndex: number) {
    const folder = folders.value.find((f) => f.id === folderId)
    if (!folder) return
    await moveItemInContainer(
      folderId, folder.parentId, targetParentId, targetIndex,
      folders.value,
      (parentId) => getChildFolders(parentId!),
      (id, parentId) => updateFolder(id, { parentId }),
      reorderFolders
    )
  }

  /** 移动书签到新文件夹下指定位置 */
  async function moveBookmark(bookmarkId: string, targetFolderId: string, targetIndex: number) {
    const bookmark = bookmarks.value.find((b) => b.id === bookmarkId)
    if (!bookmark) return
    await moveItemInContainer(
      bookmarkId, bookmark.folderId, targetFolderId, targetIndex,
      bookmarks.value,
      (folderId) => getBookmarksByFolder(folderId!),
      (id, folderId) => updateBookmark(id, { folderId: folderId as string }),
      reorderBookmarks
    )
  }

  // ====== 导入导出 ======

  /** 导入 Chrome 书签 HTML 文件 */
  async function importBookmarks(): Promise<{ folderCount: number; bookmarkCount: number }> {
    const result = await executeImportBookmarks(folders.value, bookmarks.value)
    folders.value.push(...result.createdFolders)
    bookmarks.value.push(...result.createdBookmarks)
    return { folderCount: result.folderCount, bookmarkCount: result.bookmarkCount }
  }

  /** 导出所有书签到 HTML 文件 */
  async function exportBookmarks(): Promise<boolean> {
    const html = generateBookmarkHTML(folders.value, bookmarks.value)
    const result = await api.bookmark.exportSaveFile(html)
    return result.success
  }

  // ====== 初始化 ======

  async function init() {
    await Promise.all([loadFolders(), loadBookmarks()])
  }

  return {
    folders,
    bookmarks,
    toolbarItems,
    rootFolders,
    loadFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    deleteEmptyFolders,
    reorderFolders,
    getChildFolders,
    loadBookmarks,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    batchDeleteBookmarks,
    reorderBookmarks,
    moveFolder,
    moveBookmark,
    getBookmarksByFolder,
    isBookmarked,
    findBookmarkByUrl,
    importBookmarks,
    exportBookmarks,
    init
  }
})
