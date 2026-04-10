import { BrowserWindow, Session, WebContentsView } from 'electron'
import { ensureExtensionsLoadedForAccount, getExtensionsForAccount } from './extensions'
import { getAccountById, getGroupById, getProxyById, type Proxy } from './store'
import { applyProxyToSession, fetchSessionExitIp } from './proxy'
import { getUserAgent } from '../utils/user-agent'
import { addDownload, checkConnection } from './aria2'

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
  lastActiveAt: number // 上次激活时间戳
}

class WebviewManager {
  private sessionProxyEnabled = new Map<string, boolean>()
  private views = new Map<string, ViewEntry>()
  private mainWindow: BrowserWindow | null = null
  private activeTabId: string | null = null
  private freezeTimer: ReturnType<typeof setInterval> | null = null
  private frozenTabUrls = new Map<string, { url: string; accountId: string }>() // 冻结的 tab 信息
  private _freezeMinutes = 0

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private getEffectiveProxy(accountId: string): Proxy | undefined {
    const account = accountId ? getAccountById(accountId) : undefined
    if (!account) return undefined

    const proxyId = account.proxyId ?? getGroupById(account.groupId)?.proxyId
    return proxyId ? getProxyById(proxyId) : undefined
  }

  private sendProxyInfo(tabId: string, payload: Record<string, unknown> | null): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('on:tab:proxy-info', tabId, payload)
  }

  private isSessionProxyEnabled(accountId: string): boolean {
    return this.sessionProxyEnabled.get(accountId) ?? true
  }

  private getProxyBindingText(proxy: Proxy): string {
    if (proxy.proxyMode === 'pac_url') {
      return proxy.pacUrl?.trim() || proxy.name
    }

    if (proxy.proxyMode === 'custom') {
      return proxy.name
    }

    return proxy.host?.trim() || proxy.name
  }

  async refreshProxyInfo(tabId: string): Promise<void> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      this.sendProxyInfo(tabId, null)
      return
    }

    const proxy = this.getEffectiveProxy(entry.accountId)
    if (!proxy) {
      this.sendProxyInfo(tabId, null)
      return
    }

    const account = entry.accountId ? getAccountById(entry.accountId) : undefined
    const proxyEnabled = proxy.enabled !== false

    this.sendProxyInfo(tabId, {
      enabled: proxyEnabled,
      applied: account?.autoProxyEnabled === true,
      name: proxy.name,
      text: this.getProxyBindingText(proxy),
      status: 'idle',
      proxyMode: proxy.proxyMode ?? 'global'
    })
  }

  async detectProxyInfo(tabId: string): Promise<{ ok: boolean; ip?: string; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      this.sendProxyInfo(tabId, null)
      return { ok: false, error: '标签页不存在' }
    }

    const proxy = this.getEffectiveProxy(entry.accountId)
    if (!proxy) {
      this.sendProxyInfo(tabId, null)
      return { ok: false, error: '当前标签页未绑定代理' }
    }

    const account = entry.accountId ? getAccountById(entry.accountId) : undefined
    const proxyEnabled = proxy.enabled !== false
    const applied = account?.autoProxyEnabled === true

    const bindingText = this.getProxyBindingText(proxy)
    this.sendProxyInfo(tabId, {
      enabled: proxyEnabled,
      applied,
      name: proxy.name,
      text: bindingText,
      status: 'checking',
      proxyMode: proxy.proxyMode ?? 'global'
    })

    try {
      const ip = await fetchSessionExitIp(entry.view.webContents.session)
      this.sendProxyInfo(tabId, {
        enabled: proxyEnabled,
        applied,
        name: proxy.name,
        text: bindingText,
        ip,
        status: 'success',
        proxyMode: proxy.proxyMode ?? 'global'
      })
      return { ok: true, ip }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.sendProxyInfo(tabId, {
        enabled: proxyEnabled,
        applied,
        name: proxy.name,
        text: bindingText,
        error: message,
        status: 'error',
        proxyMode: proxy.proxyMode ?? 'global'
      })
      return { ok: false, error: message }
    }
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
    const partition = accountId ? `persist:account-${accountId}` : ''

    const view = new WebContentsView({
      webPreferences: {
        partition: accountId ? partition : undefined
      }
    })

    if (account?.userAgent) {
      view.webContents.setUserAgent(getUserAgent(account.userAgent))
    }

    registerBlockedProtocolHandlers(view.webContents.session)

    let applyProxyPromise: Promise<void> | null = null

    const shouldAutoApplyProxy = proxy
      && proxy.enabled !== false
      && account?.autoProxyEnabled === true

    console.log('[WebviewManager] createView proxy decision', {
      tabId,
      accountId,
      hasProxy: !!proxy,
      proxyId: proxy?.id,
      'proxy.enabled': proxy?.enabled,
      'proxy.enabled !== false': proxy ? proxy.enabled !== false : 'N/A',
      'account.autoProxyEnabled': account?.autoProxyEnabled,
      shouldAutoApplyProxy
    })

    if (shouldAutoApplyProxy) {
      console.log('[WebviewManager] applying proxy', {
        tabId,
        accountId,
        partition: partition || 'default',
        url,
        proxyId,
        proxyMode: proxy.proxyMode ?? 'global',
        type: proxy.type ?? '',
        host: proxy.host ?? '',
        port: proxy.port ?? '',
        pacUrl: proxy.pacUrl ?? '',
        username: proxy.username ?? '',
        passwordLength: proxy.password?.length ?? 0,
        pacScriptLength: proxy.pacScript?.length ?? 0
      })
      this.sessionProxyEnabled.set(accountId, true)
      applyProxyPromise = applyProxyToSession(view.webContents.session, proxy)
        .then(() => {
          console.log('[WebviewManager] setProxy success', {
            tabId,
            partition: partition || 'default',
            proxyMode: proxy.proxyMode ?? 'global'
          })
        })
        .catch((error) => {
          console.error('[WebviewManager] setProxy failed', {
            tabId,
            partition: partition || 'default',
            proxyMode: proxy.proxyMode ?? 'global',
            message: error instanceof Error ? error.message : String(error)
          })
        })
    } else if (proxy) {
      // 代理配置存在但不自动应用（代理被禁用或账号未开启自动代理）
      console.log('[WebviewManager] proxy exists but not auto-applied', {
        tabId,
        accountId,
        proxyEnabled: proxy.enabled !== false,
        autoProxyEnabled: account?.autoProxyEnabled ?? false
      })
      this.sessionProxyEnabled.set(accountId, false)
      this.sendProxyInfo(tabId, {
        enabled: proxy.enabled !== false,
        applied: false,
        name: proxy.name,
        text: this.getProxyBindingText(proxy),
        status: 'idle',
        proxyMode: proxy.proxyMode ?? 'global'
      })
    } else {
      console.log('[WebviewManager] no proxy applied', {
        tabId,
        accountId,
        partition: partition || 'default',
        url
      })
      this.sendProxyInfo(tabId, null)
    }

    view.setVisible(false)
    this.mainWindow.contentView.addChildView(view)
    this.views.set(tabId, { view, tabId, accountId, lastActiveAt: Date.now() })
    this.setupEventForwarding(tabId, view)

    const extensions = getExtensionsForAccount(accountId || null)
    extensions.addTab(view.webContents, this.mainWindow)

    void (async () => {
      try {
        if (applyProxyPromise) {
          await applyProxyPromise
        }
        await this.refreshProxyInfo(tabId)
        await ensureExtensionsLoadedForAccount(accountId || null)
        await view.webContents.loadURL(url)
      } catch (error) {
        console.error(`[WebviewManager] loadURL failed for tab ${tabId}:`, error)
      }
    })()

    return view.webContents
  }

  private setupEventForwarding(tabId: string, view: WebContentsView): void {
    const wc = view.webContents
    const win = this.mainWindow
    if (!win) return

    const isWebUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://')
    const canSend = () => !win.isDestroyed()

    wc.setWindowOpenHandler(({ url }) => {
      if (!isWebUrl(url)) return { action: 'deny' }

      const entry = this.views.get(tabId)
      if (entry && canSend()) {
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
      if (canSend()) win.webContents.send('on:tab:title-updated', tabId, title)
    })

    wc.on('did-navigate', (_event, url) => {
      if (canSend()) win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
    })

    wc.on('did-navigate-in-page', (_event, url) => {
      if (canSend()) win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
    })

    wc.on('did-start-loading', () => {
      const currentEntry = this.views.get(tabId)
      this.sendNavState(tabId)
    })

    wc.on('did-stop-loading', () => {
      const currentEntry = this.views.get(tabId)
      this.sendNavState(tabId)
    })

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      const currentEntry = this.views.get(tabId)
    })

    wc.on('render-process-gone', (_event, details) => {
      const currentEntry = this.views.get(tabId)
    })

    wc.on('did-finish-load', () => {
      const currentEntry = this.views.get(tabId)
    })

    wc.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0 && canSend()) {
        win.webContents.send('on:tab:favicon-updated', tabId, favicons[0])
      }
    })

    // 拦截下载事件，转发到 aria2
    wc.session.on('will-download', async (event, item) => {
      // 仅在 aria2 可用时接管下载
      if (!(await checkConnection())) return

      event.preventDefault()
      const url = item.getURL()
      const filename = item.getFilename()
      const referer = wc.getURL()

      try {
        // 获取该 session 下对应 URL 的 cookies
        const cookies = await wc.session.cookies.get({ url })
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

        const headers: string[] = []
        if (cookieStr) {
          await addDownload(url, { filename, referer, cookies: cookieStr, headers })
        } else {
          await addDownload(url, { filename, referer })
        }
        // 通知渲染进程有新下载
        if (canSend()) win.webContents.send('on:download:started', { url, filename, tabId })
      } catch (e) {
        console.error('[Aria2] 添加下载失败:', e)
      }
    })
  }

  private sendNavState(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry || !this.mainWindow || this.mainWindow.isDestroyed()) return

    const wc = entry.view.webContents
    this.mainWindow.webContents.send('on:tab:nav-state', tabId, {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      isLoading: wc.isLoading()
    })
  }

  destroyView(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry) {
      // 也清理冻结记录
      this.frozenTabUrls.delete(tabId)
      return
    }

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

    this.sendProxyInfo(tabId, null)
  }

  switchView(tabId: string): void {
    if (!this.mainWindow) return

    // 更新当前激活标签的 lastActiveAt
    if (this.activeTabId) {
      const current = this.views.get(this.activeTabId)
      if (current) {
        current.view.setVisible(false)
        current.lastActiveAt = Date.now()
      }
    }

    // 如果目标标签被冻结，先解冻（重建 view）
    if (this.frozenTabUrls.has(tabId)) {
      const frozen = this.frozenTabUrls.get(tabId)!
      this.frozenTabUrls.delete(tabId)
      this.createView(tabId, frozen.accountId, frozen.url)
      this.mainWindow.webContents.send('on:tab:frozen', tabId, false)
    }

    const target = this.views.get(tabId)
    if (!target) return

    target.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    target.view.setVisible(true)
    target.lastActiveAt = Date.now()
    this.activeTabId = tabId

    const extensions = getExtensionsForAccount(target.accountId || null)
    extensions.selectTab(target.view.webContents)

    this.mainWindow.webContents.send('on:tab:activated', tabId)
    this.mainWindow.webContents.send('on:tab:request-bounds')
    void this.refreshProxyInfo(tabId)
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

  async setProxyEnabledForTab(tabId: string, enabled: boolean): Promise<{ ok: boolean; enabled: boolean; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      return { ok: false, enabled, error: '标签页不存在' }
    }

    const proxy = this.getEffectiveProxy(entry.accountId)
    if (!proxy) {
      this.sendProxyInfo(tabId, null)
      return { ok: false, enabled: false, error: '当前标签页未绑定代理' }
    }

    // 代理配置被禁用时，不允许开启
    console.log('[WebviewManager] setProxyEnabledForTab', {
      tabId,
      enabled,
      'proxy.enabled': proxy.enabled,
      willBlock: enabled && proxy.enabled === false
    })
    if (enabled && proxy.enabled === false) {
      return { ok: false, enabled: false, error: '代理配置已被禁用' }
    }

    const relatedTabIds = this.getTabIdsByAccount(entry.accountId)
    this.sessionProxyEnabled.set(entry.accountId, enabled)

    try {
      await applyProxyToSession(entry.view.webContents.session, enabled ? proxy : null)
      for (const relatedTabId of relatedTabIds) {
        await this.refreshProxyInfo(relatedTabId)
      }
      for (const relatedTabId of relatedTabIds) {
        this.reload(relatedTabId)
      }
      return { ok: true, enabled }
    } catch (error) {
      this.sessionProxyEnabled.set(entry.accountId, !enabled)
      for (const relatedTabId of relatedTabIds) {
        await this.refreshProxyInfo(relatedTabId)
      }
      return {
        ok: false,
        enabled: !enabled,
        error: error instanceof Error ? error.message : String(error)
      }
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

  // ====== 标签冻结机制 ======

  /** 设置冻结超时分钟数，0 表示禁用 */
  setFreezeMinutes(minutes: number): void {
    this._freezeMinutes = minutes
    this.stopFreezeTimer()
    if (minutes > 0) {
      this.startFreezeTimer()
    }
  }

  /** 启动冻结定时器（每 30 秒检查一次） */
  private startFreezeTimer(): void {
    if (this.freezeTimer) return
    this.freezeTimer = setInterval(() => this.checkFreeze(), 30_000)
  }

  /** 停止冻结定时器 */
  private stopFreezeTimer(): void {
    if (this.freezeTimer) {
      clearInterval(this.freezeTimer)
      this.freezeTimer = null
    }
  }

  /** 检查并冻结超时的非激活标签 */
  private checkFreeze(): void {
    if (!this._freezeMinutes || !this.mainWindow || this.mainWindow.isDestroyed()) return

    const threshold = this._freezeMinutes * 60_000
    const now = Date.now()

    for (const [tabId, entry] of this.views) {
      // 跳过当前激活标签和内部页面
      if (tabId === this.activeTabId) continue
      if (now - entry.lastActiveAt < threshold) continue

      const url = entry.view.webContents.getURL()
      if (url.startsWith('sessionbox://')) continue

      // 记录冻结信息（用于后续解冻重建）
      this.frozenTabUrls.set(tabId, { url, accountId: entry.accountId })

      // 销毁 view 但保留 tab 数据
      try {
        const extensions = getExtensionsForAccount(entry.accountId || null)
        if (!entry.view.webContents.isDestroyed()) {
          extensions.removeTab(entry.view.webContents)
        }
        entry.view.setVisible(false)
        entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
        this.mainWindow!.contentView.removeChildView(entry.view)
        if (!entry.view.webContents.isDestroyed()) {
          entry.view.webContents.close()
        }
      } catch {
        // 忽略销毁异常
      }

      this.views.delete(tabId)
      this.mainWindow!.webContents.send('on:tab:frozen', tabId, true)
    }
  }

  /** 获取标签是否已冻结 */
  isFrozen(tabId: string): boolean {
    return this.frozenTabUrls.has(tabId)
  }

  /** 设置标签音频静音状态 */
  setAudioMuted(tabId: string, muted: boolean): void {
    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.setAudioMuted(muted)
    }
  }
}

export const webviewManager = new WebviewManager()
