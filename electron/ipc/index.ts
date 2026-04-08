import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { join } from 'path'
import { copyFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountById,
  listFavoriteSites,
  createFavoriteSite,
  updateFavoriteSite,
  deleteFavoriteSite
} from '../services/store'
import type { Account, Group, FavoriteSite } from '../services/store'
import { registerTabIpcHandlers } from './tab'
import { registerProxyIpcHandlers } from './proxy'

/** 账号图标存储目录 */
const iconDir = join(app.getPath('userData'), 'account-icons')

/**
 * 注册所有 IPC 处理器
 * 在 app ready 后调用
 */
export function registerIpcHandlers(): void {
  // ====== 分组 ======
  ipcMain.handle('group:list', () => listGroups())

  ipcMain.handle('group:create', (_e, name: string) => createGroup(name))

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
    deleteAccount(id)
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

  // ====== 常用网站 ======
  ipcMain.handle('favoriteSite:list', () => listFavoriteSites())

  ipcMain.handle('favoriteSite:create', (_e, data: Omit<FavoriteSite, 'id'>) =>
    createFavoriteSite(data)
  )

  ipcMain.handle('favoriteSite:update', (_e, id: string, data: Partial<Omit<FavoriteSite, 'id'>>) =>
    updateFavoriteSite(id, data)
  )

  ipcMain.handle('favoriteSite:delete', (_e, id: string) => deleteFavoriteSite(id))

  // ====== 窗口控制 ======
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })

  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })
}
