import { BrowserWindow, Session, WebContentsView } from 'electron'
import { ensureExtensionsLoadedForAccount, getExtensionsForAccount } from './extensions'
import { getAccountById, getGroupById, getProxyById } from './store'
import { getUserAgent } from '../utils/user-agent'

export const BLOCKED_SCHEMES = [
  'bitbrowser',
  'microsoft-edge',
  'thunder',
  'xunlei',
  'ed2k',
  'flashget',
  'qqdl',
  'baidubar',
  'alipays',
  'weixin',
  'tg',
  'zoommtg',
  'teams',
  'slack',
  'discord',
  'spotify',
  'steam',
  'skype',
  'magnet',
  'vb-hyperlink'
]

function registerBlockedProtocolHandlers(targetSession: Session): void {
  for (const scheme of BLOCKED_SCHEMES) {
    try {
      targetSession.protocol.handle(scheme, () => new Response(null, { status: 204 }))
    } catch {
      // 某些 scheme 可能已注册，忽略即可。
    }
  }
}

interface ViewEntry {
  view: WebContentsView
  tabId: string
  accountId: string
}

class WebviewManager {
  private views = new Map<string, ViewEntry>()
  private mainWindow: BrowserWindow | null = null
  private activeTabId: string | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  createView(tabId: string, accountId: string, url: string) {
    if (!this.mainWindow) return null

    // 内部页面不创建 WebContentsView
    if (url.startsWith('sessionbox://')) return null

    const account = accountId ? getAccountById(accountId) : undefined
    if (accountId && !account) return null

    const proxyId =
      account?.proxyId ?? (account ? getGroupById(account.groupId)?.proxyId : undefined)
    const proxy = proxyId ? getProxyById(proxyId) : undefined

    const view = new WebContentsView({
      webPreferences: {
        partition: accountId ? `persist:account-${accountId}` : undefined
      }
    })

    if (account?.userAgent) {
      view.webContents.setUserAgent(getUserAgent(account.userAgent))
    }

    registerBlockedProtocolHandlers(view.webContents.session)

    if (proxy) {
      const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : ''
      const proxyRules = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
      void view.webContents.session.setProxy({ proxyRules })
    }

    view.setVisible(false)
    this.mainWindow.contentView.addChildView(view)
    this.views.set(tabId, { view, tabId, accountId })
    this.setupEventForwarding(tabId, view)

    const extensions = getExtensionsForAccount(accountId || null)
    extensions.addTab(view.webContents, this.mainWindow)

    void (async () => {
      await ensureExtensionsLoadedForAccount(accountId || null)
      await view.webContents.loadURL(url)
    })()

    return view.webContents
  }

  private setupEventForwarding(tabId: string, view: WebContentsView): void {
    const wc = view.webContents
    const win = this.mainWindow
    if (!win) return

    const isWebUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://')

    wc.setWindowOpenHandler(({ url }) => {
      if (!isWebUrl(url)) return { action: 'deny' }

      const entry = this.views.get(tabId)
      if (entry) {
        win.webContents.send('on:tab:open-url', entry.accountId, url)
      }

      return { action: 'deny' }
    })

    wc.on('will-navigate', (event, url) => {
      if (!isWebUrl(url)) event.preventDefault()
    })

    wc.on('will-redirect', (event, url) => {
      if (!isWebUrl(url)) event.preventDefault()
    })

    wc.on('page-title-updated', (_event, title) => {
      win.webContents.send('on:tab:title-updated', tabId, title)
    })

    wc.on('did-navigate', (_event, url) => {
      win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
    })

    wc.on('did-navigate-in-page', (_event, url) => {
      win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
    })

    wc.on('did-start-loading', () => {
      this.sendNavState(tabId)
    })

    wc.on('did-stop-loading', () => {
      this.sendNavState(tabId)
    })

    wc.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0) {
        win.webContents.send('on:tab:favicon-updated', tabId, favicons[0])
      }
    })
  }

  private sendNavState(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry || !this.mainWindow) return

    const wc = entry.view.webContents
    this.mainWindow.webContents.send('on:tab:nav-state', tabId, {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      isLoading: wc.isLoading()
    })
  }

  destroyView(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry) return

    this.views.delete(tabId)

    try {
      const extensions = getExtensionsForAccount(entry.accountId || null)
      if (!entry.view.webContents.isDestroyed()) {
        extensions.removeTab(entry.view.webContents)
      }

      if (!this.mainWindow?.isDestroyed()) {
        entry.view.setVisible(false)
        entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
        this.mainWindow.contentView.removeChildView(entry.view)
      }

      if (!entry.view.webContents.isDestroyed()) {
        entry.view.webContents.close()
      }
    } catch {
      // 关闭过程中忽略 Electron 已销毁异常。
    }

    if (this.activeTabId === tabId) {
      this.activeTabId = null
    }
  }

  switchView(tabId: string): void {
    if (!this.mainWindow) return

    if (this.activeTabId) {
      const current = this.views.get(this.activeTabId)
      if (current) current.view.setVisible(false)
    }

    const target = this.views.get(tabId)
    if (!target) return

    target.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    target.view.setVisible(true)
    this.activeTabId = tabId

    const extensions = getExtensionsForAccount(target.accountId || null)
    extensions.selectTab(target.view.webContents)

    this.mainWindow.webContents.send('on:tab:activated', tabId)
    this.mainWindow.webContents.send('on:tab:request-bounds')
  }

  updateBounds(rect: { x: number; y: number; width: number; height: number }): void {
    if (!this.activeTabId) return

    const entry = this.views.get(this.activeTabId)
    if (entry) {
      entry.view.setBounds(rect)
    }
  }

  navigate(tabId: string, url: string): void {
    // 内部页面不加载到 WebContentsView
    if (url.startsWith('sessionbox://')) return
    const entry = this.views.get(tabId)
    if (entry) {
      void entry.view.webContents.loadURL(url)
    }
  }

  goBack(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && entry.view.webContents.navigationHistory.canGoBack()) {
      entry.view.webContents.navigationHistory.goBack()
    }
  }

  goForward(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && entry.view.webContents.navigationHistory.canGoForward()) {
      entry.view.webContents.navigationHistory.goForward()
    }
  }

  reload(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry) {
      entry.view.webContents.reload()
    }
  }

  openDevTools(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.openDevTools()
    }
  }

  setOverlayVisible(visible: boolean): void {
    if (!this.activeTabId) return

    const entry = this.views.get(this.activeTabId)
    if (entry) {
      entry.view.setVisible(visible)
    }
  }

  destroyAll(): void {
    const tabIds = [...this.views.keys()]
    for (const tabId of tabIds) {
      this.destroyView(tabId)
    }
  }

  getTabIdsByAccount(accountId: string): string[] {
    const result: string[] = []
    for (const [tabId, entry] of this.views) {
      if (entry.accountId === accountId) {
        result.push(tabId)
      }
    }
    return result
  }

  getViewInfo(tabId: string): { url: string; accountId: string } | null {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null

    return {
      url: entry.view.webContents.getURL(),
      accountId: entry.accountId
    }
  }

  getWebContents(tabId: string) {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null
    return entry.view.webContents
  }

  getTabIdByWebContents(target: Electron.WebContents): string | null {
    for (const [tabId, entry] of this.views) {
      if (entry.view.webContents === target) {
        return tabId
      }
    }
    return null
  }

  switchByWebContents(target: Electron.WebContents): string | null {
    const tabId = this.getTabIdByWebContents(target)
    if (!tabId) return null
    this.switchView(tabId)
    return tabId
  }

  destroyByWebContents(target: Electron.WebContents): string | null {
    const tabId = this.getTabIdByWebContents(target)
    if (!tabId) return null
    this.destroyView(tabId)
    return tabId
  }

  /**
   * 获取指定账号 partition 下当前活动 tab 的 ID。
   * accountId 为 null 时返回默认 session 的活动 tab ID。
   */
  getActiveTabIdByAccount(accountId: string | null): string | null {
    for (const [tabId, entry] of this.views) {
      if (entry.accountId === (accountId ?? '')) {
        return tabId
      }
    }
    return null
  }
}

export const webviewManager = new WebviewManager()
