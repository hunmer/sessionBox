import { WebContentsView, BrowserWindow } from 'electron'
import { getAccountById, getGroupById, getProxyById } from './store'
import { getUserAgent } from '../utils/user-agent'

interface ViewEntry {
  view: WebContentsView
  tabId: string
  accountId: string
}

/**
 * WebContentsView 生命周期管理器
 * 负责创建、销毁、切换视图，以及事件转发
 */
class WebviewManager {
  private views = new Map<string, ViewEntry>()
  private mainWindow: BrowserWindow | null = null
  private activeTabId: string | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** 创建 WebContentsView 并添加到窗口 */
  createView(tabId: string, accountId: string, url: string): void {
    if (!this.mainWindow) return

    const account = getAccountById(accountId)
    if (!account) return

    // 确定代理配置：账号级 > 分组级
    const proxyId = account.proxyId ?? getGroupById(account.groupId)?.proxyId
    const proxy = proxyId ? getProxyById(proxyId) : undefined

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:account-${accountId}`
      }
    })

    // 设置 User-Agent
    view.webContents.setUserAgent(getUserAgent(account.userAgent))

    // 设置代理（在加载 URL 之前）
    if (proxy) {
      const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : ''
      const proxyRules = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
      view.webContents.session.setProxy({ proxyRules })
    }

    // 加载 URL
    view.webContents.loadURL(url)

    // 初始隐藏，等待 bounds 更新后再显示
    view.setVisible(false)

    // 添加到窗口
    this.mainWindow.contentView.addChildView(view)

    // 保存引用
    this.views.set(tabId, { view, tabId, accountId })

    // 注册事件转发
    this.setupEventForwarding(tabId, view)
  }

  /** 注册 WebContents 事件 → 渲染进程转发 */
  private setupEventForwarding(tabId: string, view: WebContentsView): void {
    const wc = view.webContents
    const win = this.mainWindow
    if (!win) return

    // 仅允许 http/https 协议的判断
    const isWebUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://')

    // 拦截新窗口打开，在应用内新 tab 中加载
    wc.setWindowOpenHandler(({ url }) => {
      if (!isWebUrl(url)) return { action: 'deny' }
      const entry = this.views.get(tabId)
      if (entry) {
        win.webContents.send('on:tab:open-url', entry.accountId, url)
      }
      return { action: 'deny' }
    })

    // 拦截主框架导航中的非 http/https 协议
    wc.on('will-navigate', (event, url) => {
      if (!isWebUrl(url)) event.preventDefault()
    })

    // 拦截服务端重定向（302等）到自定义协议的跳转
    wc.on('will-redirect', (event, url) => {
      if (!isWebUrl(url)) event.preventDefault()
    })

    wc.on('page-title-updated', (_e, title) => {
      win.webContents.send('on:tab:title-updated', tabId, title)
    })

    wc.on('did-navigate', (_e, url) => {
      win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
    })

    wc.on('did-navigate-in-page', (_e, url) => {
      win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
    })

    wc.on('did-start-loading', () => {
      this.sendNavState(tabId)
    })

    wc.on('did-stop-loading', () => {
      this.sendNavState(tabId)
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      if (favicons.length > 0) {
        win.webContents.send('on:tab:favicon-updated', tabId, favicons[0])
      }
    })
  }

  /** 向渲染进程发送导航状态 */
  private sendNavState(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry || !this.mainWindow) return

    const wc = entry.view.webContents
    const state = {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      isLoading: wc.isLoading()
    }
    this.mainWindow.webContents.send('on:tab:nav-state', tabId, state)
  }

  /** 销毁指定 Tab 的 WebContentsView */
  destroyView(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry || !this.mainWindow) return

    // 先隐藏并重置 bounds，避免移除时视觉残留
    entry.view.setVisible(false)
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    this.mainWindow.contentView.removeChildView(entry.view)
    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close()
    }
    this.views.delete(tabId)

    if (this.activeTabId === tabId) {
      this.activeTabId = null
    }
  }

  /** 切换 Tab 可见性 */
  switchView(tabId: string): void {
    if (!this.mainWindow) return

    // 隐藏当前视图
    if (this.activeTabId) {
      const current = this.views.get(this.activeTabId)
      if (current) current.view.setVisible(false)
    }

    // 显示目标视图
    const target = this.views.get(tabId)
    if (target) {
      // 先设置 bounds 再显示，避免视图渲染空白
      target.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      target.view.setVisible(true)
      this.activeTabId = tabId

      // 通知渲染进程同步真实 bounds
      this.mainWindow.webContents.send('on:tab:request-bounds')
    }
  }

  /** 更新当前活跃视图的位置和大小 */
  updateBounds(rect: { x: number; y: number; width: number; height: number }): void {
    if (!this.activeTabId) return
    const entry = this.views.get(this.activeTabId)
    if (entry) {
      entry.view.setBounds(rect)
    }
  }

  /** 导航到指定 URL */
  navigate(tabId: string, url: string): void {
    const entry = this.views.get(tabId)
    if (entry) entry.view.webContents.loadURL(url)
  }

  /** 后退 */
  goBack(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && entry.view.webContents.navigationHistory.canGoBack()) {
      entry.view.webContents.navigationHistory.goBack()
    }
  }

  /** 前进 */
  goForward(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && entry.view.webContents.navigationHistory.canGoForward()) {
      entry.view.webContents.navigationHistory.goForward()
    }
  }

  /** 刷新 */
  reload(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry) entry.view.webContents.reload()
  }

  /** 控制当前活跃视图的可见性（用于 dialog 弹出时隐藏 webview） */
  setOverlayVisible(visible: boolean): void {
    if (!this.activeTabId) return
    const entry = this.views.get(this.activeTabId)
    if (entry) {
      entry.view.setVisible(visible)
    }
  }

  /** 销毁所有视图（退出时调用） */
  destroyAll(): void {
    for (const tabId of this.views.keys()) {
      this.destroyView(tabId)
    }
  }

  /** 获取指定账号的所有活跃 Tab ID */
  getTabIdsByAccount(accountId: string): string[] {
    const result: string[] = []
    for (const [tabId, entry] of this.views) {
      if (entry.accountId === accountId) result.push(tabId)
    }
    return result
  }
}

export const webviewManager = new WebviewManager()
