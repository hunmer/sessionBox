import { app, BrowserWindow, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { setupUserAgent } from './utils/user-agent'
import { registerIpcHandlers } from './ipc'
import { webviewManager } from './services/webview-manager'

// 在 app ready 之前设置 UA
setupUserAgent()

// 注册自定义协议，用于加载账号图标（必须在 app ready 前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'account-icon',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 初始化 WebContentsView 管理器
  webviewManager.setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 通知渲染进程窗口最大化状态变化
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('on:window:maximized')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('on:window:unmaximized')
  })

  // 窗口关闭时销毁所有 WebContentsView
  mainWindow.on('closed', () => {
    webviewManager.destroyAll()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.session-box')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册所有 IPC 处理器
  registerIpcHandlers()

  // 注册 account-icon:// 协议，从 userData/account-icons/ 目录提供文件
  const iconDir = join(app.getPath('userData'), 'account-icons')
  protocol.handle('account-icon', (request) => {
    const fileName = decodeURIComponent(request.url.replace('account-icon://', ''))
    return net.fetch(`file://${join(iconDir, fileName).replace(/\\/g, '/')}`)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
