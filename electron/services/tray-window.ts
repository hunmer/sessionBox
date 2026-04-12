// electron/services/tray-window.ts
import { BrowserWindow, Tray, screen } from 'electron'
import { getTrayWindowSizes, updateTrayWindowSize } from './store'
import type { Page, TrayWindowSizes } from './store'
import { getUserAgent } from '../utils/user-agent'

type TrayWindowType = keyof TrayWindowSizes

// 移动端 Chrome User-Agent
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36'

interface TaskbarWindowEntry {
  win: BrowserWindow
  page: Page
  mode: 'desktop' | 'mobile'
  id: string
}

/** 节流函数 */
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

class TrayWindowManager {
  private windows = new Set<BrowserWindow>()
  private taskbarWindows = new Map<string, TaskbarWindowEntry>()
  private nextId = 0

  /** 创建新窗口打开指定页面 */
  openInNewWindow(page: Page): BrowserWindow {
    const containerId = page.containerId || ''
    const partition = containerId ? `persist:container-${containerId}` : undefined
    const saved = getTrayWindowSizes().newWindow

    const win = new BrowserWindow({
      width: saved.width,
      height: saved.height,
      show: false,
      autoHideMenuBar: true,
      title: page.name || '新窗口',
      webPreferences: {
        partition,
        sandbox: false
      }
    })

    // 始终设置 Chrome UA，避免暴露 Electron 标识
    win.webContents.setUserAgent(getUserAgent(page.userAgent))
    win.loadURL(page.url || 'about:blank')
    win.once('ready-to-show', () => win.show())

    this.trackWindow(win, 'newWindow')
    return win
  }

  /** 创建贴近任务栏的窗口 */
  openAtTaskbar(tray: Tray, page: Page, mode: 'desktop' | 'mobile'): BrowserWindow {
    const containerId = page.containerId || ''
    const partition = containerId ? `persist:container-${containerId}` : undefined
    const saved = getTrayWindowSizes()[mode]

    const win = new BrowserWindow({
      width: saved.width,
      height: saved.height,
      show: false,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        partition,
        sandbox: false
      }
    })

    // 定位到 Tray 图标附近
    this.positionNearTray(win, tray, saved.width, saved.height)

    // 手机版使用移动端 User-Agent，桌面版使用 Chrome UA
    if (mode === 'mobile') {
      win.webContents.setUserAgent(MOBILE_USER_AGENT)
    } else {
      win.webContents.setUserAgent(getUserAgent(page.userAgent))
    }

    win.loadURL(page.url || 'about:blank')
    win.once('ready-to-show', () => win.show())

    const id = `taskbar-${this.nextId++}`
    const entry: TaskbarWindowEntry = { win, page, mode, id }

    // 失焦自动隐藏（不关闭）
    win.on('blur', () => {
      if (!win.isDestroyed()) win.hide()
    })

    win.on('closed', () => {
      this.taskbarWindows.delete(id)
    })

    // 节流保存窗口尺寸
    const saveSize = throttle(() => {
      if (win.isDestroyed()) return
      const bounds = win.getBounds()
      updateTrayWindowSize(mode, { width: bounds.width, height: bounds.height })
    }, 500)
    win.on('resize', saveSize)

    this.taskbarWindows.set(id, entry)
    return win
  }

  /** 获取所有任务栏窗口（用于菜单展示） */
  getTaskbarWindows(): TaskbarWindowEntry[] {
    // 清理已销毁的窗口
    for (const [id, entry] of this.taskbarWindows) {
      if (entry.win.isDestroyed()) {
        this.taskbarWindows.delete(id)
      }
    }
    return [...this.taskbarWindows.values()]
  }

  /** 显示指定任务栏窗口 */
  showTaskbarWindow(id: string): void {
    const entry = this.taskbarWindows.get(id)
    if (entry && !entry.win.isDestroyed()) {
      entry.win.show()
      entry.win.focus()
    }
  }

  /** 关闭指定任务栏窗口 */
  closeTaskbarWindow(id: string): void {
    const entry = this.taskbarWindows.get(id)
    if (entry) {
      this.taskbarWindows.delete(id)
      if (!entry.win.isDestroyed()) {
        entry.win.destroy()
      }
    }
  }

  /** 将窗口定位到 Tray 图标附近 */
  private positionNearTray(win: BrowserWindow, tray: Tray, width: number, height: number): void {
    try {
      const trayBounds = tray.getBounds()
      const display = screen.getDisplayNearestPoint({
        x: trayBounds.x + trayBounds.width / 2,
        y: trayBounds.y + trayBounds.height / 2
      })
      const { workArea } = display

      // 默认在 Tray 图标上方显示
      let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2)
      let y = Math.round(trayBounds.y - height)

      // 如果超出屏幕上方，改为下方
      if (y < workArea.y) {
        y = trayBounds.y + trayBounds.height
      }

      // 确保不超出屏幕左右边界
      x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width))
      y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))

      win.setPosition(x, y)
    } catch {
      // 获取位置失败时居中显示
      win.center()
    }
  }

  /** 跟踪普通窗口生命周期并保存尺寸 */
  private trackWindow(win: BrowserWindow, type: TrayWindowType): void {
    this.windows.add(win)

    // 节流保存窗口尺寸
    const saveSize = throttle(() => {
      if (win.isDestroyed()) return
      const bounds = win.getBounds()
      updateTrayWindowSize(type, { width: bounds.width, height: bounds.height })
    }, 500)
    win.on('resize', saveSize)

    win.on('closed', () => {
      this.windows.delete(win)
    })
  }

  /** 销毁所有窗口（普通 + 任务栏） */
  destroyAll(): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
    this.windows.clear()

    for (const [, entry] of this.taskbarWindows) {
      if (!entry.win.isDestroyed()) {
        entry.win.destroy()
      }
    }
    this.taskbarWindows.clear()
  }
}

export const trayWindowManager = new TrayWindowManager()
export type { TaskbarWindowEntry }
