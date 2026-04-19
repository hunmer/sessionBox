import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
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

  const folders = store.get('bookmarkFolders', [])
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
 * 将工作流数据迁移到独立文件：
 * - 文件夹 → workflow-folders.json
 * - 工作流 → workflows/{id}.json（每个工作流独立文件）
 *
 * 支持从 electron-store 或旧的单文件 workflow-store.json 迁移。
 * 幂等设计：目标目录已存在文件则跳过。
 */
export function migrateWorkflows(): void {
  const workflowsDir = join(userDataPath, 'workflows')
  const foldersPath = join(userDataPath, 'workflow-folders.json')
  const oldSinglePath = join(userDataPath, 'workflow-store.json')

  // 已迁移过（文件夹文件存在），跳过
  if (existsSync(foldersPath)) return

  let workflows: Workflow[] = []
  let workflowFolders: WorkflowFolder[] = []
  let source = ''

  // 优先从旧的单文件 workflow-store.json 读取
  if (existsSync(oldSinglePath)) {
    try {
      const data = JSON.parse(readFileSync(oldSinglePath, 'utf-8'))
      workflows = data.workflows ?? []
      workflowFolders = data.workflowFolders ?? []
      source = 'workflow-store.json'
    } catch {
      // 文件损坏，继续尝试 electron-store
    }
  }

  // 如果没从单文件读到，从 electron-store 读取
  if (!source) {
    const store = new Store<LegacyStoreSchema>()
    if (store.has('workflows') || store.has('workflowFolders')) {
      workflows = store.get('workflows', [])
      workflowFolders = store.get('workflowFolders', [])
      source = 'electron-store'
    }
  }

  // 没有数据需要迁移，创建空文件夹索引文件即可
  if (!source) {
    writeFileSync(foldersPath, JSON.stringify({ workflowFolders: [] }, null, 2), 'utf-8')
    mkdirSync(workflowsDir, { recursive: true })
    console.log('[Migration] Created empty workflow storage')
    return
  }

  // 写入文件夹索引
  writeFileSync(foldersPath, JSON.stringify({ workflowFolders }, null, 2), 'utf-8')

  // 写入每个工作流独立文件
  mkdirSync(workflowsDir, { recursive: true })
  for (const w of workflows) {
    writeFileSync(join(workflowsDir, `${w.id}.json`), JSON.stringify(w, null, 2), 'utf-8')
  }

  console.log(`[Migration] Migrated ${workflows.length} workflows and ${workflowFolders.length} folders from ${source}`)

  // 清理旧数据
  if (source === 'electron-store') {
    const store = new Store<LegacyStoreSchema>()
    store.delete('workflows')
    store.delete('workflowFolders')
    console.log('[Migration] Removed workflows/workflowFolders from electron-store')
  } else if (source === 'workflow-store.json') {
    unlinkSync(oldSinglePath)
    console.log('[Migration] Removed old workflow-store.json')
  }
}
