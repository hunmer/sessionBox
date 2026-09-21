// electron/services/tray-window.ts
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, screen } from 'electron'
import { join } from 'path'
import {
  getFloatingBallStates,
  getTrayWindowSizes,
  listPages,
  removeFloatingBallState,
  setFloatingBallState,
  updateTrayWindowSize
} from './store'
import type { Page, TrayWindowSizes } from './store'
import { getUserAgent, getMobileUserAgent, installClientHintsRewrite } from '../utils/user-agent'
import { fetchAndCacheFavicon, getCachedIconPath } from './favicon-cache'

type TrayWindowType = keyof TrayWindowSizes

interface TaskbarWindowEntry {
  win: BrowserWindow
  floatingBall: BrowserWindow | null
  floatingBallPosition: { x: number; y: number } | null
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
  private preserveStatesOnDestroy = false
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private dragState: { ball: BrowserWindow; startCursor: { x: number; y: number }; startWindow: { x: number; y: number }; moved: boolean } | null = null

  constructor() {
    ipcMain.on('floating-ball:pointer', (event, data: { type: string; x: number; y: number }) => {
      const entry = [...this.taskbarWindows.values()].find(item => item.floatingBall?.webContents === event.sender)
      const ball = entry?.floatingBall
      if (!entry || !ball || ball.isDestroyed()) return

      if (data.type === 'pointer-down') {
        const [x, y] = ball.getPosition()
        this.dragState = { ball, startCursor: { x: data.x, y: data.y }, startWindow: { x, y }, moved: false }
      } else if (data.type === 'pointer-move' && this.dragState?.ball === ball) {
        const x = this.dragState.startWindow.x + data.x - this.dragState.startCursor.x
        const y = this.dragState.startWindow.y + data.y - this.dragState.startCursor.y
        if (Math.abs(data.x - this.dragState.startCursor.x) > 2 || Math.abs(data.y - this.dragState.startCursor.y) > 2) {
          this.dragState.moved = true
        }
        const position = this.clampFloatingBallPosition({ x, y }, 56)
        ball.setPosition(position.x, position.y)
      } else if (data.type === 'pointer-up' && this.dragState?.ball === ball) {
        const moved = this.dragState.moved
        this.dragState = null
        if (!moved) {
          this.showTaskbarWindow(entry.id)
        } else {
          const { x, y } = ball.getBounds()
          entry.floatingBallPosition = { x, y }
          setFloatingBallState({ id: entry.id, pageId: entry.page.id, mode: entry.mode, x, y })
          console.info('[FloatingBall] position saved', { id: entry.id, x, y })
        }
      } else if (data.type === 'context-menu') {
        this.showFloatingBallMenu(entry, ball)
      }
    })
  }

  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  setTray(tray: Tray): void {
    this.tray = tray
  }

  openTabAtTaskbar(page: Page, url: string): void {
    if (!this.tray) {
      console.warn('[TrayWindow] tray is not ready, cannot open tab at taskbar')
      return
    }
    this.openAtTaskbar(this.tray, { ...page, url }, 'desktop')
  }

  /** 恢复上次退出时仍隐藏在悬浮图标中的任务栏窗口。 */
  restoreFloatingBalls(tray: Tray): void {
    const pages = listPages()
    for (const state of getFloatingBallStates()) {
      const page = pages.find(item => item.id === state.pageId)
      if (!page) {
        removeFloatingBallState(state.id)
        continue
      }
      this.openAtTaskbar(tray, page, state.mode, {
        id: state.id,
        position: { x: state.x, y: state.y },
        startHidden: true
      })
      console.info('[FloatingBall] restored', { id: state.id, pageId: state.pageId, x: state.x, y: state.y })
    }
  }

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
    installClientHintsRewrite(win.webContents.session)
    win.loadURL(page.url || 'about:blank')
    win.once('ready-to-show', () => win.show())

    this.trackWindow(win, 'newWindow')
    return win
  }

  /** 创建贴近任务栏的窗口 */
  openAtTaskbar(
    tray: Tray,
    page: Page,
    mode: 'desktop' | 'mobile',
    restore?: { id: string; position: { x: number; y: number }; startHidden: boolean }
  ): BrowserWindow {
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
      win.webContents.setUserAgent(getMobileUserAgent())
    } else {
      win.webContents.setUserAgent(getUserAgent(page.userAgent))
    }
    installClientHintsRewrite(win.webContents.session)

    win.loadURL(page.url || 'about:blank')
    win.once('ready-to-show', () => {
      if (!restore?.startHidden) win.show()
    })

    const id = restore?.id ?? `taskbar-${Date.now()}-${this.nextId++}`
    const entry: TaskbarWindowEntry = {
      win,
      floatingBall: null,
      floatingBallPosition: restore?.position ?? null,
      page,
      mode,
      id
    }

    // 失焦自动隐藏（不关闭）
    win.on('blur', () => {
      if (!win.isDestroyed()) {
        win.hide()
        this.showFloatingBall(entry)
      }
    })

    win.on('closed', () => {
      this.closeFloatingBall(entry, this.preserveStatesOnDestroy)
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
    if (restore?.startHidden) this.showFloatingBall(entry, restore.position)
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
      this.closeFloatingBall(entry)
      entry.win.show()
      entry.win.focus()
    }
  }

  /** 关闭指定任务栏窗口 */
  closeTaskbarWindow(id: string): void {
    const entry = this.taskbarWindows.get(id)
    if (entry) {
      this.taskbarWindows.delete(id)
      this.closeFloatingBall(entry)
      removeFloatingBallState(id)
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
  destroyAll(preserveFloatingBalls = false): void {
    this.preserveStatesOnDestroy = preserveFloatingBalls
    for (const win of this.windows) {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
    this.windows.clear()

    for (const [, entry] of this.taskbarWindows) {
      this.closeFloatingBall(entry, preserveFloatingBalls)
      if (!entry.win.isDestroyed()) {
        entry.win.destroy()
      }
    }
    this.taskbarWindows.clear()
  }

  /** 创建失焦后的桌面悬浮球。悬浮球本身使用 Chromium 原生拖拽区域。 */
  private showFloatingBall(entry: TaskbarWindowEntry, savedPosition?: { x: number; y: number }): void {
    if (entry.floatingBall && !entry.floatingBall.isDestroyed()) {
      entry.floatingBall.showInactive()
      return
    }

    const bounds = entry.win.getBounds()
    const ballSize = 56
    const defaultPosition = {
      x: bounds.x + Math.max(0, Math.round((bounds.width - ballSize) / 2)),
      y: bounds.y + Math.max(0, Math.round((bounds.height - ballSize) / 2))
    }
    const position = this.clampFloatingBallPosition(
      savedPosition ?? entry.floatingBallPosition ?? defaultPosition,
      ballSize
    )
    entry.floatingBallPosition = position
    const ball = new BrowserWindow({
      width: ballSize,
      height: ballSize,
      x: position.x,
      y: position.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/floating-ball-preload.js'),
        sandbox: false
      }
    })

    entry.floatingBall = ball
    ball.setAlwaysOnTop(true, 'floating')
    ball.on('closed', () => {
      if (entry.floatingBall === ball) entry.floatingBall = null
    })
    const savePosition = throttle(() => {
      if (ball.isDestroyed()) return
      const { x, y } = ball.getBounds()
      entry.floatingBallPosition = { x, y }
      setFloatingBallState({ id: entry.id, pageId: entry.page.id, mode: entry.mode, x, y })
    }, 300)
    ball.on('move', savePosition)
    setFloatingBallState({
      id: entry.id,
      pageId: entry.page.id,
      mode: entry.mode,
      x: position.x,
      y: position.y
    })
    this.loadFloatingBallHtml(ball, entry.page)
    console.info('[FloatingBall] shown', { id: entry.id, pageId: entry.page.id, ...position })
    ball.once('ready-to-show', () => {
      if (!ball.isDestroyed()) ball.showInactive()
    })
  }

  private closeFloatingBall(entry: TaskbarWindowEntry, preserveState = false): void {
    const ball = entry.floatingBall
    entry.floatingBall = null
    if (ball && !ball.isDestroyed()) {
      const { x, y } = ball.getBounds()
      entry.floatingBallPosition = { x, y }
    }
    if (preserveState && ball && !ball.isDestroyed()) {
      const { x, y } = ball.getBounds()
      setFloatingBallState({ id: entry.id, pageId: entry.page.id, mode: entry.mode, x, y })
    }
    if (!preserveState) removeFloatingBallState(entry.id)
    if (ball && !ball.isDestroyed()) ball.close()
  }

  private async loadFloatingBallHtml(ball: BrowserWindow, page: Page): Promise<void> {
    const appIconPath = app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '../../resources/icon.png')
    let domain = ''
    try {
      domain = new URL(page.url).hostname
    } catch {
      // 页面 URL 无效时使用应用图标。
    }
    const appIconDataUrl = this.getIconDataUrl(appIconPath)
    const cachedIconPath = domain ? getCachedIconPath(domain) : null
    const cachedIconDataUrl = cachedIconPath ? this.getIconDataUrl(cachedIconPath) : null
    this.setFloatingBallContent(ball, cachedIconDataUrl ?? appIconDataUrl)

    if (!domain || cachedIconDataUrl) return
    const faviconPath = await fetchAndCacheFavicon(domain)
    if (ball.isDestroyed() || faviconPath.endsWith('unknow.ico')) return
    const faviconUrl = this.getIconDataUrl(faviconPath)
    if (!faviconUrl) return
    ball.webContents.executeJavaScript(
      `const icon=document.getElementById('icon');icon.style.display='';icon.src=${JSON.stringify(faviconUrl)}`
    ).catch(() => undefined)
  }

  private getIconDataUrl(iconPath: string): string | null {
    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) return null
    return image.resize({ width: 38, height: 38, quality: 'best' }).toDataURL()
  }

  private setFloatingBallContent(ball: BrowserWindow, iconDataUrl: string | null): void {
    if (ball.isDestroyed()) return
    ball.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getFloatingBallHtml(iconDataUrl))}`)
  }

  private showFloatingBallMenu(entry: TaskbarWindowEntry, ball: BrowserWindow): void {
    console.info('[FloatingBall] context menu', { id: entry.id, pageId: entry.page.id })
    Menu.buildFromTemplate([
      {
        label: '在软件内打开',
        click: () => {
          const mainWindow = this.mainWindow
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('on:tray:openInApp', entry.page.id)
          }
          this.closeTaskbarWindow(entry.id)
        }
      },
      { type: 'separator' },
      {
        label: '关闭',
        click: () => this.closeTaskbarWindow(entry.id)
      }
    ]).popup({ window: ball })
  }

  private clampFloatingBallPosition(position: { x: number; y: number }, size: number): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint(position)
    const { workArea } = display
    return {
      x: Math.max(workArea.x, Math.min(position.x, workArea.x + workArea.width - size)),
      y: Math.max(workArea.y, Math.min(position.y, workArea.y + workArea.height - size))
    }
  }

  private getFloatingBallHtml(iconUrl: string | null): string {
    const image = iconUrl
      ? `<img id="icon" src="${iconUrl}" onerror="this.style.display='none'">`
      : '<img id="icon" style="display:none">'
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{box-sizing:border-box;width:100%;height:100%;margin:0;overflow:hidden;background:transparent}
      a{box-sizing:border-box;display:flex;width:100%;height:100%;align-items:center;justify-content:center;
        border:2px solid rgba(255,255,255,.9);border-radius:50%;background:#fff;
        text-decoration:none;user-select:none;cursor:pointer}
      img{width:38px;height:38px;object-fit:contain;border-radius:8px;pointer-events:none}
      .fallback{position:absolute;color:#2563eb;font:700 24px Arial,sans-serif;pointer-events:none}
      img:not([style*="display: none"])+.fallback{display:none}
      body{padding:3px}
      a:hover{background:#f3f4f6}
    </style></head><body><a id="ball" aria-label="恢复窗口">${image}<span class="fallback">S</span></a><script>
      const ball=document.getElementById('ball');let down=false;
      ball.addEventListener('mousedown',e=>{if(e.button!==0)return;down=true;window.floatingBall.send('pointer-down',e.screenX,e.screenY);e.preventDefault()});
      ball.addEventListener('contextmenu',e=>{e.preventDefault();window.floatingBall.send('context-menu',e.screenX,e.screenY)});
      document.addEventListener('mousemove',e=>{if(down)window.floatingBall.send('pointer-move',e.screenX,e.screenY)});
      document.addEventListener('mouseup',e=>{if(!down)return;down=false;window.floatingBall.send('pointer-up',e.screenX,e.screenY)});
    </script></body></html>`
  }
}

export const trayWindowManager = new TrayWindowManager()
export type { TaskbarWindowEntry }
