import { app, BrowserWindow, nativeImage, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { setupUserAgent } from './utils/user-agent'
import { registerIpcHandlers } from './ipc'
import { registerDownloadIpcHandlers } from './ipc/download'
import { webviewManager, BLOCKED_SCHEMES } from './services/webview-manager'
import { listExtensions, getWindowState, setWindowState, getTabFreezeMinutes } from './services/store'
import { getAutoUpdater } from './composables/useAutoUpdater'
import { registerGlobalShortcuts, unregisterGlobalShortcuts, handleBeforeInputEvent } from './services/shortcut-manager'

// 节流函数
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: NodeJS.Timeout | null = null
  return ((...args: Parameters<T>) => {
    if (timer) return
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, delay)
  }) as T
}

// 在 app ready 之前设置 UA
setupUserAgent()

process.on('uncaughtException', (error) => {
  console.error('[Main] uncaughtException', {
    name: error.name,
    message: error.message,
    stack: error.stack
  })
})

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error
    ? { name: reason.name, message: reason.message, stack: reason.stack }
    : { reason: String(reason) }
  console.error('[Main] unhandledRejection', error)
})

// 注册自定义协议，用于加载账号图标和扩展图标（必须在 app ready 前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'account-icon',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true }
  },
  {
    scheme: 'extension-icon',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true }
  }
])

// 注册 sessionbox:// 深度链接协议
app.setAsDefaultProtocolClient('sessionbox')

/** 处理 sessionbox:// 协议 URL */
function handleProtocolUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.host === 'openContainer') {
      const containerId = parsed.searchParams.get('id')
      if (!containerId) return
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
        win.webContents.send('open-container', containerId)
      }
    }
  } catch (e) {
    console.error('协议 URL 解析失败', e)
  }
}

// 单实例锁：防止多开，同时用于接收深度链接
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  // Windows: 协议 URL 通过 second-instance 事件传入（应用已在运行时）
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((arg) => arg.startsWith('sessionbox://'))
    if (url) handleProtocolUrl(url)
  })

  function createWindow(): void {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '../../resources/icon.png')

    // 加载窗口状态
    const windowState = getWindowState()

    const mainWindow = new BrowserWindow({
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      icon: nativeImage.createFromPath(iconPath),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // 如果保存的状态是最大化，则恢复
    if (windowState.isMaximized) {
      mainWindow.maximize()
    }

    // 初始化 WebContentsView 管理器
    webviewManager.setMainWindow(mainWindow)

    // 初始化自动更新器主窗口引用
    getAutoUpdater().setMainWindow(mainWindow)

    mainWindow.on('ready-to-show', () => {
      mainWindow.show()
    })

    // 通知渲染进程窗口最大化状态变化
    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('on:window:maximized')
      // 同步保存最大化状态
      const state = getWindowState()
      setWindowState({ ...state, isMaximized: true })
    })
    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('on:window:unmaximized')
      const state = getWindowState()
      setWindowState({ ...state, isMaximized: false })
    })

    // 节流保存窗口状态（位置和大小变化时）
    const saveWindowBounds = throttle(() => {
      if (mainWindow.isDestroyed() || mainWindow.isMaximized()) return
      const bounds = mainWindow.getBounds()
      const state = getWindowState()
      setWindowState({
        ...state,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      })
    }, 500)

    mainWindow.on('resize', saveWindowBounds)
    mainWindow.on('move', saveWindowBounds)

    // 窗口即将关闭时保存最终状态（此时窗口仍可访问）
    mainWindow.on('close', () => {
      if (!mainWindow.isMaximized()) {
        const bounds = mainWindow.getBounds()
        const state = getWindowState()
        setWindowState({
          ...state,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height
        })
      }
    })

    // 窗口已销毁后清理 WebContentsView
    mainWindow.on('closed', () => {
      webviewManager.destroyAll()
    })

    // 拦截本地快捷键（禁用 Ctrl+R 刷新、Ctrl+W 关闭等系统默认行为）
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (handleBeforeInputEvent(input, mainWindow.webContents)) {
        event.preventDefault()
      }
    })

    // 首次启动时处理协议 URL（例如从桌面快捷方式启动）
    const protocolUrl = process.argv.find((arg) => arg.startsWith('sessionbox://'))
    if (protocolUrl) {
      mainWindow.webContents.once('did-finish-load', () => {
        handleProtocolUrl(protocolUrl)
      })
    }

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
    registerDownloadIpcHandlers()

    // 初始化标签冻结定时器
    webviewManager.setFreezeMinutes(getTabFreezeMinutes())

    // 注册 account-icon:// 协议，从 userData/account-icons/ 目录提供文件
    const iconDir = join(app.getPath('userData'), 'account-icons')
    protocol.handle('account-icon', (request) => {
      const fileName = decodeURIComponent(request.url.replace('account-icon://', ''))
      return net.fetch(`file://${join(iconDir, fileName).replace(/\\/g, '/')}`)
    })

    // 注册 extension-icon:// 协议，通过扩展 ID 查找并返回扩展图标文件
    protocol.handle('extension-icon', (request) => {
      const extensionId = decodeURIComponent(request.url.replace('extension-icon://', ''))
      const extension = listExtensions().find((e) => e.id === extensionId)
      if (!extension?.icon) return new Response('Not found', { status: 404 })
      return net.fetch(`file://${extension.icon.replace(/\\/g, '/')}`)
    })

    // 注册已知第三方协议的空处理器，防止网站唤起外部应用时系统弹出"打开方式"对话框
    for (const scheme of BLOCKED_SCHEMES) {
      protocol.handle(scheme, () => new Response(null, { status: 204 }))
    }

    createWindow()

    // 注册全局快捷键
    registerGlobalShortcuts()

    // 启动 3 秒后自动检查更新
    setTimeout(() => {
      const autoUpdater = getAutoUpdater()
      console.log('[Main] 开始检查更新...')
      autoUpdater.checkForUpdates()
    }, 3000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    unregisterGlobalShortcuts()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
