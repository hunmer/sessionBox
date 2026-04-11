import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron'
import { join } from 'path'
import { copyFileSync, mkdirSync, existsSync, unlinkSync, writeFileSync, rmSync } from 'node:fs'
import { execSync } from 'child_process'
import { randomUUID } from 'node:crypto'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  reorderContainers,
  listContainers,
  createContainer,
  updateContainer,
  deleteContainer,
  getContainerById,
  listBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
  batchCreateBookmarks,
  listBookmarkFolders,
  createBookmarkFolder,
  updateBookmarkFolder,
  deleteBookmarkFolder,
  reorderBookmarkFolders,
  batchCreateBookmarkFolders,
  migrateBookmarks,
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  reorderWorkspaces,
  getTabFreezeMinutes,
  setTabFreezeMinutes,
  getMutedSites,
  setMutedSites,
  addMutedSite,
  removeMutedSite,
  listPages,
  createPage,
  updatePage,
  deletePage,
  reorderPages,
  getPageById,
  getPagesByContainer
} from '../services/store'
import type { Container, Group, Bookmark as BookmarkType, Workspace, BookmarkFolder, Page } from '../services/store'
import { registerTabIpcHandlers } from './tab'
import { registerProxyIpcHandlers } from './proxy'
import { registerUpdaterIpc } from './updater'
import { registerExtensionHandlers } from './extensions'
import { registerShortcutIpcHandlers } from './shortcut'
import { registerBookmarkCheckIpc } from './bookmark-check'
import { webviewManager } from '../services/webview-manager'

/** 容器图标存储目录 */
const iconDir = join(app.getPath('userData'), 'container-icons')

/**
 * 注册所有 IPC 处理器
 * 在 app ready 后调用
 */
export function registerIpcHandlers(): void {
  // ====== 书签数据迁移 ======
  migrateBookmarks()

  // ====== 工作区 ======
  ipcMain.handle('workspace:list', () => listWorkspaces())

  ipcMain.handle('workspace:create', (_e, title: string, color: string) => createWorkspace(title, color))

  ipcMain.handle('workspace:update', (_e, id: string, data: Partial<Omit<Workspace, 'id'>>) =>
    updateWorkspace(id, data)
  )

  ipcMain.handle('workspace:delete', (_e, id: string) => deleteWorkspace(id))

  ipcMain.handle('workspace:reorder', (_e, workspaceIds: string[]) => reorderWorkspaces(workspaceIds))

  // ====== 分组 ======
  ipcMain.handle('group:list', () => listGroups())

  ipcMain.handle('group:create', (_e, name: string, color?: string, workspaceId?: string, proxyId?: string, icon?: string) => createGroup(name, color, workspaceId, proxyId, icon))

  ipcMain.handle('group:update', (_e, id: string, data: Partial<Omit<Group, 'id'>>) =>
    updateGroup(id, data)
  )

  ipcMain.handle('group:delete', (_e, id: string) => deleteGroup(id))

  ipcMain.handle('group:reorder', (_e, groupIds: string[]) => reorderGroups(groupIds))

  // ====== 容器 ======
  ipcMain.handle('container:list', () => listContainers())

  ipcMain.handle('container:create', (_e, data: Omit<Container, 'id'>) => createContainer(data))

  ipcMain.handle('container:update', (_e, id: string, data: Partial<Omit<Container, 'id'>>) =>
    updateContainer(id, data)
  )

  ipcMain.handle('container:delete', (_e, id: string) => {
    // 检查是否为默认容器
    if (id === 'default') {
      throw new Error('默认容器不可删除')
    }

    // 清理该容器的自定义图标文件
    const container = getContainerById(id)
    if (container?.icon?.startsWith('img:')) {
      const filePath = join(iconDir, container.icon.slice(4))
      if (existsSync(filePath)) unlinkSync(filePath)
    }

    // 清理该容器的 partition 目录
    const partitionPath = join(app.getPath('userData'), 'Partitions', `persist:container-${id}`)
    if (existsSync(partitionPath)) rmSync(partitionPath, { recursive: true })

    // 将关联此容器的 Page 的 containerId 置空
    const affectedPages = getPagesByContainer(id)
    for (const page of affectedPages) {
      updatePage(page.id, { containerId: undefined })
    }

    deleteContainer(id)
  })

  ipcMain.handle('container:reorder', (_e, containerIds: string[]) => reorderContainers(containerIds))

  // ====== 页面管理 ======
  ipcMain.handle('page:list', () => listPages())
  ipcMain.handle('page:create', (_e, data: Omit<Page, 'id'>) => createPage(data))
  ipcMain.handle('page:update', (_e, id: string, data: Partial<Omit<Page, 'id'>>) => updatePage(id, data))
  ipcMain.handle('page:delete', (_e, id: string) => deletePage(id))
  ipcMain.handle('page:reorder', (_e, pageIds: string[]) => reorderPages(pageIds))

  /** 创建桌面快捷方式（.url 文件），使用 sessionbox:// 协议打开容器 */
  ipcMain.handle('container:createDesktopShortcut', (_e, containerId: string) => {
    const container = getContainerById(containerId)
    if (!container) throw new Error(`容器 ${containerId} 不存在`)

    const desktopPath = app.getPath('desktop')
    const shortcutPath = join(desktopPath, `${container.name}.url`)
    const protocolUrl = `sessionbox://openContainer?id=${container.id}`

    // 默认使用应用图标
    let iconFile = process.execPath.replace(/\\/g, '/')

    // 如果有自定义图片图标，转换为 ICO 格式供快捷方式使用（.url 不支持 PNG/JPG）
    if (container.icon?.startsWith('img:')) {
      const imgName = container.icon.slice(4)
      const imgPath = join(iconDir, imgName)

      if (existsSync(imgPath) && !imgName.endsWith('.svg')) {
        const icoName = imgName.replace(/\.[^.]+$/, '.ico')
        const icoPath = join(iconDir, icoName)

        // 缓存 ICO，避免重复转换
        if (!existsSync(icoPath)) {
          try {
            const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${imgPath}')
$icon = [System.Drawing.Icon]::FromHandle($img.GetHicon())
$stream = [System.IO.FileStream]::new('${icoPath}', 'Create')
$icon.Save($stream)
$stream.Close()
$img.Dispose()`
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
            execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
              windowsHide: true,
              timeout: 5000
            })
          } catch {
            // 转换失败，继续使用默认应用图标
          }
        }

        if (existsSync(icoPath)) {
          iconFile = icoPath.replace(/\\/g, '/')
        }
      }
    }

    const content = [
      '[InternetShortcut]',
      `URL=${protocolUrl}`,
      `IconFile=${iconFile}`,
      'IconIndex=0',
      ''
    ].join('\r\n')

    writeFileSync(shortcutPath, content, 'utf-8')
    return shortcutPath
  })

  /** 选择图片并保存到本地图标目录，返回图标标识（img:文件名） */
  ipcMain.handle('container:uploadIcon', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择容器图标',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    // 确保图标目录存在
    if (!existsSync(iconDir)) mkdirSync(iconDir, { recursive: true })

    const srcPath = result.filePaths[0]
    const ext = srcPath.split('.').pop() || 'png'
    const fileName = `${randomUUID()}.${ext}`
    const destPath = join(iconDir, fileName)

    copyFileSync(srcPath, destPath)
    return `img:${fileName}`
  })

  // ====== 代理（详细处理在 ipc/proxy.ts，含热更新） ======
  registerProxyIpcHandlers()

  // ====== Tab（详细处理在 ipc/tab.ts） ======
  registerTabIpcHandlers()

  // ====== 自动更新 ======
  registerUpdaterIpc()

  // ====== 扩展 ======
  registerExtensionHandlers()

  // ====== 快捷键 ======
  registerShortcutIpcHandlers()

  // ====== 书签健康检查 ======
  registerBookmarkCheckIpc()

  // ====== 书签 ======
  ipcMain.handle('bookmark:list', () => listBookmarks())

  ipcMain.handle('bookmark:create', (_e, data: Omit<BookmarkType, 'id'>) =>
    createBookmark(data)
  )

  ipcMain.handle('bookmark:update', (_e, id: string, data: Partial<Omit<BookmarkType, 'id'>>) =>
    updateBookmark(id, data)
  )

  ipcMain.handle('bookmark:delete', (_e, id: string) => deleteBookmark(id))

  ipcMain.handle('bookmark:reorder', (_e, ids: string[]) => reorderBookmarks(ids))

  ipcMain.handle('bookmark:importOpenFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择书签文件',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    const { readFileSync } = await import('node:fs')
    return { html: readFileSync(filePaths[0], 'utf-8') }
  })

  ipcMain.handle('bookmark:exportSaveFile', async (e, html: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { success: false }
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出书签',
      defaultPath: 'bookmarks.html',
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (canceled || !filePath) return { success: false }
    const { writeFileSync } = await import('node:fs')
    writeFileSync(filePath, html, 'utf-8')
    return { success: true }
  })

  ipcMain.handle(
    'bookmark:batchCreate',
    (
      _e,
      data: {
        folders: Omit<BookmarkFolder, 'id'>[]
        bookmarks: Omit<BookmarkType, 'id'>[]
      }
    ) => {
      const createdFolders = batchCreateBookmarkFolders(data.folders)
      const createdBookmarks = batchCreateBookmarks(data.bookmarks)
      return { folders: createdFolders, bookmarks: createdBookmarks }
    }
  )

  // ====== 书签文件夹 ======
  ipcMain.handle('bookmarkFolder:list', () => listBookmarkFolders())

  ipcMain.handle('bookmarkFolder:create', (_e, data: Omit<BookmarkFolder, 'id'>) =>
    createBookmarkFolder(data)
  )

  ipcMain.handle('bookmarkFolder:update', (_e, id: string, data: Partial<Omit<BookmarkFolder, 'id'>>) =>
    updateBookmarkFolder(id, data)
  )

  ipcMain.handle('bookmarkFolder:delete', (_e, id: string) => deleteBookmarkFolder(id))

  ipcMain.handle('bookmarkFolder:reorder', (_e, ids: string[]) => reorderBookmarkFolders(ids))

  // ====== 窗口控制 ======
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })

  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })

  ipcMain.handle('window:toggleFullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.setFullScreen(!win.isFullScreen())
  })

  // ====== 外部链接 ======
  ipcMain.handle('openExternal', (_e, url: string) => shell.openExternal(url))

  // ====== 应用设置 ======
  ipcMain.handle('settings:getTabFreezeMinutes', () => getTabFreezeMinutes())
  ipcMain.handle('settings:setTabFreezeMinutes', (_e, minutes: number) => {
    setTabFreezeMinutes(minutes)
    webviewManager.setFreezeMinutes(minutes)
  })

  // ====== 默认静音网站 ======
  ipcMain.handle('mutedSites:list', () => getMutedSites())
  ipcMain.handle('mutedSites:set', (_e, sites: string[]) => setMutedSites(sites))
  ipcMain.handle('mutedSites:add', (_e, hostname: string) => addMutedSite(hostname))
  ipcMain.handle('mutedSites:remove', (_e, hostname: string) => removeMutedSite(hostname))
}
