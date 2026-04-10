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
  reorderAccounts,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountById,
  listBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
  listBookmarkFolders,
  createBookmarkFolder,
  updateBookmarkFolder,
  deleteBookmarkFolder,
  reorderBookmarkFolders,
  migrateBookmarks,
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  reorderWorkspaces,
  getTabFreezeMinutes,
  setTabFreezeMinutes
} from '../services/store'
import type { Account, Group, Bookmark as BookmarkType, Workspace, BookmarkFolder } from '../services/store'
import { registerTabIpcHandlers } from './tab'
import { registerProxyIpcHandlers } from './proxy'
import { registerUpdaterIpc } from './updater'
import { registerExtensionHandlers } from './extensions'
import { registerShortcutIpcHandlers } from './shortcut'
import { webviewManager } from '../services/webview-manager'

/** 账号图标存储目录 */
const iconDir = join(app.getPath('userData'), 'account-icons')

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

  // ====== 账号 ======
  ipcMain.handle('account:list', () => listAccounts())

  ipcMain.handle('account:create', (_e, data: Omit<Account, 'id'>) => createAccount(data))

  ipcMain.handle('account:update', (_e, id: string, data: Partial<Omit<Account, 'id'>>) =>
    updateAccount(id, data)
  )

  ipcMain.handle('account:delete', (_e, id: string) => {
    // 清理该账号的自定义图标文件
    const account = getAccountById(id)
    if (account?.icon?.startsWith('img:')) {
      const filePath = join(iconDir, account.icon.slice(4))
      if (existsSync(filePath)) unlinkSync(filePath)
    }
    // 清理该账号的 partition 目录（Session/Cookie 数据）
    const partitionPath = join(app.getPath('userData'), 'Partitions', `persist:account-${id}`)
    if (existsSync(partitionPath)) rmSync(partitionPath, { recursive: true })
    deleteAccount(id)
  })

  ipcMain.handle('account:reorder', (_e, accountIds: string[]) => reorderAccounts(accountIds))

  /** 创建桌面快捷方式（.url 文件），使用 sessionbox:// 协议打开账号 */
  ipcMain.handle('account:createDesktopShortcut', (_e, accountId: string) => {
    const account = getAccountById(accountId)
    if (!account) throw new Error(`账号 ${accountId} 不存在`)

    const desktopPath = app.getPath('desktop')
    const shortcutPath = join(desktopPath, `${account.name}.url`)
    const protocolUrl = `sessionbox://openAccount?id=${account.id}`

    // 默认使用应用图标
    let iconFile = process.execPath.replace(/\\/g, '/')

    // 如果有自定义图片图标，转换为 ICO 格式供快捷方式使用（.url 不支持 PNG/JPG）
    if (account.icon?.startsWith('img:')) {
      const imgName = account.icon.slice(4)
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
  ipcMain.handle('account:uploadIcon', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择账号图标',
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

  // ====== 外部链接 ======
  ipcMain.handle('openExternal', (_e, url: string) => shell.openExternal(url))

  // ====== 应用设置 ======
  ipcMain.handle('settings:getTabFreezeMinutes', () => getTabFreezeMinutes())
  ipcMain.handle('settings:setTabFreezeMinutes', (_e, minutes: number) => {
    setTabFreezeMinutes(minutes)
    webviewManager.setFreezeMinutes(minutes)
  })
}
