import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { join } from 'path'
import { copyFileSync, mkdirSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
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
