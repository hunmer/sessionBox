import { join } from 'path'
import { app } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'crypto'
import Store from 'electron-store'
import type { Bookmark, BookmarkFolder, PasswordEntry, Page, Workflow, WorkflowFolder } from './store'

const BOOKMARK_BAR_FOLDER_ID = '__bookmark_bar__'

const userDataPath = app.getPath('userData')

interface LegacyStoreSchema {
  bookmarks: Bookmark[]
  bookmarkFolders: BookmarkFolder[]
  passwords: PasswordEntry[]
  favoriteSites: any[]
  pages: Page[]
  workflows: Workflow[]
  workflowFolders: WorkflowFolder[]
  [key: string]: unknown
}

/** 迁移 Bookmark 的 containerId → pageId（在 electron-store 内执行） */
function migrateBookmarkContainerIdToPageId(store: Store<LegacyStoreSchema>): void {
  const bookmarks = store.get('bookmarks', []) as Record<string, any>[]
  const pages = store.get('pages', [])
  let updated = false

  const newBookmarks = bookmarks.map(b => {
    if (b.pageId) return b
    if (b.containerId) {
      const page = pages.find((p: Page) => p.containerId === b.containerId)
      updated = true
      return { ...b, pageId: page?.id ?? '' }
    }
    return b
  })

  if (updated) {
    store.set('bookmarks', newBookmarks as Bookmark[])
    console.log('[Migration] Updated bookmarks with pageId')
  }
}

/** 迁移旧 favoriteSites 键名，以及为无 folderId 的旧书签分配文件夹 */
function legacyMigrateBookmarks(store: Store<LegacyStoreSchema>): void {
  if (store.has('favoriteSites')) {
    const oldData = store.get('favoriteSites', [])
    if (oldData.length > 0 && !store.has('bookmarks')) {
      store.set('bookmarks', oldData)
    }
    store.delete('favoriteSites')
  }

  const sites = store.get('bookmarks', [])
  if (sites.length === 0) return

  const needsMigration = sites.some((s) => !('folderId' in s) || s.folderId === undefined)
  if (!needsMigration) return

  let folders = store.get('bookmarkFolders', [])
  if (folders.length === 0) {
    const defaultFolder: BookmarkFolder = { id: randomUUID(), name: '默认文件夹', parentId: null, order: 0 }
    folders.push(defaultFolder)
    store.set('bookmarkFolders', folders)
  }
  const barFolder = folders.find((f) => f.id === BOOKMARK_BAR_FOLDER_ID)
  if (barFolder) {
    barFolder.name = '默认文件夹'
    store.set('bookmarkFolders', folders)
  }
  const fallbackFolderId = folders[0].id

  const migrated = sites.map((s, index) => ({
    ...s,
    folderId: s.folderId || fallbackFolderId,
    order: s.order ?? index
  }))
  store.set('bookmarks', migrated)
}

/**
 * 将 electron-store 中的 bookmarks、bookmarkFolders、passwords 迁移到独立的 JsonStore 文件。
 * 幂等设计：目标文件已存在则跳过。
 */
export function migrateBookmarksAndPasswords(): void {
  const bookmarkPath = join(userDataPath, 'bookmark-store.json')
  const passwordPath = join(userDataPath, 'password-store.json')

  const store = new Store<LegacyStoreSchema>()

  // 先执行旧迁移逻辑（操作 electron-store 中的数据）
  if (!existsSync(bookmarkPath)) {
    migrateBookmarkContainerIdToPageId(store)
    legacyMigrateBookmarks(store)
  }

  // 迁移书签
  if (!existsSync(bookmarkPath)) {
    const bookmarks = store.get('bookmarks', [])
    const bookmarkFolders = store.get('bookmarkFolders', [])

    writeFileSync(bookmarkPath, JSON.stringify({ bookmarks, bookmarkFolders }, null, 2), 'utf-8')

    if (bookmarks.length > 0 || bookmarkFolders.length > 0) {
      console.log(`[Migration] Migrated ${bookmarks.length} bookmarks and ${bookmarkFolders.length} folders to bookmark-store.json`)
    } else {
      console.log('[Migration] Created empty bookmark-store.json')
    }

    // 迁移成功，移除旧数据
    store.delete('bookmarks')
    store.delete('bookmarkFolders')
    console.log('[Migration] Removed bookmarks/bookmarkFolders from electron-store')
  }

  // 迁移密码
  if (!existsSync(passwordPath)) {
    const passwords = store.get('passwords', [])

    writeFileSync(passwordPath, JSON.stringify({ passwords }, null, 2), 'utf-8')

    if (passwords.length > 0) {
      console.log(`[Migration] Migrated ${passwords.length} passwords to password-store.json`)
    } else {
      console.log('[Migration] Created empty password-store.json')
    }

    // 迁移成功，移除旧数据
    store.delete('passwords')
    console.log('[Migration] Removed passwords from electron-store')
  }
}

/**
 * 将 electron-store 中的 workflows、workflowFolders 迁移到独立的 JsonStore 文件。
 * 幂等设计：目标文件已存在则跳过。
 */
export function migrateWorkflows(): void {
  const workflowPath = join(userDataPath, 'workflow-store.json')

  const store = new Store<LegacyStoreSchema>()

  if (!existsSync(workflowPath)) {
    const workflows = store.get('workflows', [])
    const workflowFolders = store.get('workflowFolders', [])

    writeFileSync(workflowPath, JSON.stringify({ workflows, workflowFolders }, null, 2), 'utf-8')

    if (workflows.length > 0 || workflowFolders.length > 0) {
      console.log(`[Migration] Migrated ${workflows.length} workflows and ${workflowFolders.length} folders to workflow-store.json`)
    } else {
      console.log('[Migration] Created empty workflow-store.json')
    }

    // 迁移成功，移除旧数据
    store.delete('workflows')
    store.delete('workflowFolders')
    console.log('[Migration] Removed workflows/workflowFolders from electron-store')
  }
}
