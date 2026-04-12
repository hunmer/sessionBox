import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Bookmark, BookmarkFolder } from '../types'

const api = window.api

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

  // ====== 移动操作 ======

  /** 移动文件夹到新的父级下指定位置 */
  async function moveFolder(folderId: string, targetParentId: string | null, targetIndex: number) {
    const folder = folders.value.find((f) => f.id === folderId)
    if (!folder) return

    const oldParentId = folder.parentId

    // 如果同父级下移动，直接重排
    if (oldParentId === targetParentId) {
      const siblings = getChildFolders(oldParentId)
      const reordered = siblings.filter((f) => f.id !== folderId)
      reordered.splice(targetIndex, 0, folder)
      await reorderFolders(reordered.map((f) => f.id))
      return
    }

    // 跨父级移动：先更新 parentId
    await updateFolder(folderId, { parentId: targetParentId })

    // 在旧父级下重排剩余子项
    const oldSiblings = getChildFolders(oldParentId)
    if (oldSiblings.length > 0) {
      await reorderFolders(oldSiblings.map((f) => f.id))
    }

    // 在新父级下插入并重排
    const newSiblings = getChildFolders(targetParentId)
    const reordered = newSiblings.filter((f) => f.id !== folderId)
    reordered.splice(targetIndex, 0, folder)
    await reorderFolders(reordered.map((f) => f.id))
  }

  /** 移动书签到新文件夹下指定位置 */
  async function moveBookmark(bookmarkId: string, targetFolderId: string, targetIndex: number) {
    const bookmark = bookmarks.value.find((b) => b.id === bookmarkId)
    if (!bookmark) return

    const oldFolderId = bookmark.folderId

    // 如果同文件夹下移动，直接重排
    if (oldFolderId === targetFolderId) {
      const siblings = getBookmarksByFolder(oldFolderId)
      const reordered = siblings.filter((b) => b.id !== bookmarkId)
      reordered.splice(targetIndex, 0, bookmark)
      await reorderBookmarks(reordered.map((b) => b.id))
      return
    }

    // 跨文件夹移动：先更新 folderId
    await updateBookmark(bookmarkId, { folderId: targetFolderId })

    // 在旧文件夹下重排剩余书签
    const oldSiblings = getBookmarksByFolder(oldFolderId)
    if (oldSiblings.length > 0) {
      await reorderBookmarks(oldSiblings.map((b) => b.id))
    }

    // 在新文件夹下插入并重排
    const newSiblings = getBookmarksByFolder(targetFolderId)
    const reordered = newSiblings.filter((b) => b.id !== bookmarkId)
    reordered.splice(targetIndex, 0, bookmark)
    await reorderBookmarks(reordered.map((b) => b.id))
  }

  // ====== 导入导出 ======

  /** 解析 Chrome/Netscape 书签 HTML，返回待创建的文件夹和书签 */
  function parseBookmarkHTML(html: string): {
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
          const existingFolder = folders.value.find(
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
          if (bookmarks.value.some((b) => b.url === url && b.folderId === parentFolderId)) continue
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

  /** 导入 Chrome 书签 HTML 文件 */
  async function importBookmarks(): Promise<{ folderCount: number; bookmarkCount: number }> {
    const result = await api.bookmark.importOpenFile()
    if (!result) return { folderCount: 0, bookmarkCount: 0 }

    const { folders: pendingFolders, bookmarks: pendingBookmarks } = parseBookmarkHTML(result.html)
    if (pendingFolders.length === 0 && pendingBookmarks.length === 0) {
      return { folderCount: 0, bookmarkCount: 0 }
    }

    // 先批量创建文件夹，建立 ID 映射
    let folderIndex = 0
    const pendingFolderOldMap = new Map<number, string>()
    for (const f of pendingFolders) {
      folderIndex++
      pendingFolderOldMap.set(folderIndex, f.parentId || '__root__')
    }

    const created = await api.bookmark.batchCreate({ folders: pendingFolders, bookmarks: [] })

    // 建立新文件夹 ID 映射，处理父子关系
    // pendingFolderOldMap 存储了 __pending_N → 父 ID 的关系
    // 但 batchCreate 时 parentId 可能是 __pending_N 需要替换
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

    // 更新本地状态
    folders.value.push(...created.folders)
    bookmarks.value.push(...bookmarkResult.bookmarks)

    return { folderCount: created.folders.length, bookmarkCount: bookmarkResult.bookmarks.length }
  }

  /** 生成 Netscape 书签 HTML */
  function generateBookmarkHTML(): string {
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

    const rootItems = folders.value
      .filter((f) => f.parentId === null)
      .sort((a, b) => a.order - b.order)

    for (const rootFolder of rootItems) {
      renderFolder(rootFolder, lines, 1)
    }

    // 根级无文件夹的书签（理论上不存在，但兜底）
    const rootBookmarks = bookmarks.value
      .filter((b) => !folders.value.some((f) => f.id === b.folderId))
      .sort((a, b) => a.order - b.order)
    for (const bm of rootBookmarks) {
      lines.push(`        <DT><A HREF="${escapeAttr(bm.url)}">${escapeText(bm.title)}</A>`)
    }

    lines.push('</DL><p>')
    return lines.join('\n')
  }

  function renderFolder(folder: BookmarkFolder, lines: string[], depth: number) {
    const indent = '    '.repeat(depth)
    lines.push(`${indent}<DT><H3>${escapeText(folder.name)}</H3>`)
    lines.push(`${indent}<DL><p>`)

    const childFolders = folders.value
      .filter((f) => f.parentId === folder.id)
      .sort((a, b) => a.order - b.order)

    const childBookmarks = bookmarks.value
      .filter((b) => b.folderId === folder.id)
      .sort((a, b) => a.order - b.order)

    for (const child of childFolders) {
      renderFolder(child, lines, depth + 1)
    }

    for (const bm of childBookmarks) {
      lines.push(
        `${indent}    <DT><A HREF="${escapeAttr(bm.url)}">${escapeText(bm.title)}</A>`
      )
    }

    lines.push(`${indent}</DL><p>`)
  }

  function escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function escapeText(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  /** 导出所有书签到 HTML 文件 */
  async function exportBookmarks(): Promise<boolean> {
    const html = generateBookmarkHTML()
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
    reorderFolders,
    getChildFolders,
    loadBookmarks,
    createBookmark,
    updateBookmark,
    deleteBookmark,
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
