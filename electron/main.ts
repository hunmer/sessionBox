import { app, BrowserWindow, nativeImage, protocol, net } from 'electron'
import { join } from 'path'
import { setupUserAgent } from './utils/user-agent'
import { registerIpcHandlers } from './ipc'
import { registerDownloadIpcHandlers } from './ipc/download'
import { webviewManager, BLOCKED_SCHEMES } from './services/webview-manager'
import { listExtensions, getWindowState, setWindowState, getTabFreezeMinutes, getMinimizeOnClose, getMcpEnabled } from './services/store'
import { getAutoUpdater } from './composables/useAutoUpdater'
import { registerGlobalShortcuts, unregisterGlobalShortcuts, handleBeforeInputEvent } from './services/shortcut-manager'
import { trayManager } from './services/tray'
import { trayWindowManager } from './services/tray-window'
import { pluginManager } from './services/plugin-manager'
import { mcpServerService } from './services/mcp/server'
import { ensureWindowsBrowserRegistration } from './services/default-browser'
import { ensureIconDir, getCachedIconPath, fetchAndCacheFavicon, getSiteIconsDir } from './services/favicon-cache'
import { electronApp, optimizer } from '@electron-toolkit/utils'

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
  },
  {
    scheme: 'site-icon',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true }
  }
])

// 注册 sessionbox:// 深度链接协议
app.setAsDefaultProtocolClient('sessionbox')

if (process.platform === 'win32') {
  ensureWindowsBrowserRegistration()
}

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

/** 处理外部 http/https URL（默认浏览器功能） */
function handleExternalUrl(url: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  // 通知渲染进程使用默认容器打开新 tab
  win.webContents.send('on:open-external-url', url)
}

// 单实例锁：防止多开，同时用于接收深度链接
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  // Windows: 协议 URL 通过 second-instance 事件传入（应用已在运行时）
  app.on('second-instance', (_e, argv) => {
    const protocolUrl = argv.find((arg) => arg.startsWith('sessionbox://'))
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl)
      return
    }
    // 处理外部 http/https 链接（默认浏览器功能）
    const externalUrl = argv.find((arg) => arg.startsWith('http://') || arg.startsWith('https://'))
    if (externalUrl) handleExternalUrl(externalUrl)
  })

  // macOS: 外部 URL 通过 open-url 事件传入
  app.on('open-url', (_e, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      handleExternalUrl(url)
    } else if (url.startsWith('sessionbox://')) {
      handleProtocolUrl(url)
    }
  })

  let isQuitting = false

  app.on('before-quit', () => {
    isQuitting = true
    mcpServerService.stop().catch((error) => {
      console.error('[Main] Failed to stop MCP server:', error)
    })
    pluginManager.shutdown()
    trayWindowManager.destroyAll()
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

    // 窗口关闭时隐藏到托盘或直接退出（取决于用户设置）
    mainWindow.on('close', (e) => {
      if (!isQuitting) {
        const shouldMinimize = getMinimizeOnClose()
        if (shouldMinimize) {
          e.preventDefault()
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
          mainWindow.hide()
          return
        }
        // minimizeOnClose 为 false 时，允许默认关闭行为
        // isQuitting 仍为 false，但窗口关闭后会触发 window-all-closed
      }
      // 真正退出时保存状态
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

    // 首次启动时处理外部 http/https 链接（默认浏览器功能）
    const externalUrl = process.argv.find((arg) => arg.startsWith('http://') || arg.startsWith('https://'))
    if (externalUrl) {
      mainWindow.webContents.once('did-finish-load', () => {
        handleExternalUrl(externalUrl)
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

    ensureWindowsBrowserRegistration()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 注册所有 IPC 处理器
    registerIpcHandlers()
    registerDownloadIpcHandlers()

    // 初始化插件系统
    pluginManager.loadAll()

    // 初始化标签冻结定时器
    webviewManager.setFreezeMinutes(getTabFreezeMinutes())

    // 注册 account-icon:// 协议，从 userData/container-icons/ 目录提供文件
    const iconDir = join(app.getPath('userData'), 'container-icons')
    protocol.handle('account-icon', (request) => {
      const url = new URL(request.url)
      const fileName = decodeURIComponent(url.host + url.pathname).replace(/\/+$/, '')
      return net.fetch(`file://${join(iconDir, fileName).replace(/\\/g, '/')}`)
    })

    // 注册 extension-icon:// 协议，通过扩展 ID 查找并返回扩展图标文件
    protocol.handle('extension-icon', (request) => {
      const extensionId = decodeURIComponent(request.url.replace('extension-icon://', ''))
      const extension = listExtensions().find((e) => e.id === extensionId)
      if (!extension?.icon) return new Response('Not found', { status: 404 })
      return net.fetch(`file://${extension.icon.replace(/\\/g, '/')}`)
    })

    // 注册 site-icon:// 协议，从本地缓存提供网站图标，缓存未命中时自动下载
    ensureIconDir()
    protocol.handle('site-icon', async (request) => {
      // 剥离查询参数（?v=xxx 用于浏览器缓存失效）
      const raw = decodeURIComponent(request.url.replace('site-icon://', '')).replace(/\/+$/, '')
      const domain = raw.split('?')[0]
      if (!domain) return new Response('Bad request', { status: 400 })

      // 优先从本地缓存查找
      const cachedPath = getCachedIconPath(domain)
      if (cachedPath) {
        return net.fetch(`file://${cachedPath.replace(/\\/g, '/')}`)
      }

      // 缓存未命中，按策略下载并缓存（始终返回有效路径）
      const filePath = await fetchAndCacheFavicon(domain)
      return net.fetch(`file://${filePath.replace(/\\/g, '/')}`)
    })

    // 注册已知第三方协议的空处理器，防止网站唤起外部应用时系统弹出"打开方式"对话框
    for (const scheme of BLOCKED_SCHEMES) {
      protocol.handle(scheme, () => new Response(null, { status: 204 }))
    }

    createWindow()

    // 初始化系统托盘（createWindow 内部创建 mainWindow，需要在这里获取引用）
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      trayManager.init(mainWindow)
      pluginManager.setMainWindow(mainWindow)
    }

    // 注册全局快捷键
    registerGlobalShortcuts()

    // 启动 MCP Server（如果已启用）
    if (getMcpEnabled()) {
      mcpServerService.start().catch((error) => {
        console.error('[Main] Failed to start MCP server:', error)
      })
    }

    // 启动 3 秒后自动检查更新
    setTimeout(() => {
      const autoUpdater = getAutoUpdater()
      autoUpdater.initUpdateSource()
      console.log('[Main] 开始检查更新...')
      autoUpdater.checkForUpdates()
    }, 3000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    unregisterGlobalShortcuts()
    // 当 minimizeOnClose 关闭时，窗口关闭即退出应用
    if (!getMinimizeOnClose()) {
      app.quit()
    }
    // 最小化到托盘模式：用户通过 Tray 菜单退出
  })
}
