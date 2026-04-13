import { BrowserWindow, Menu, Session, WebContentsView, clipboard, nativeImage } from 'electron'
import { ensureExtensionsLoadedForContainer, getExtensionsForContainer } from './extensions'
import { getPageById, getContainerById, getGroupById, getProxyById, getMutedSites, type Proxy } from './store'
import { applyProxyToSession, fetchSessionExitIp } from './proxy'
import { getUserAgent } from '../utils/user-agent'
import { addDownload, checkConnection } from './aria2'
import { handleBeforeInputEvent } from './shortcut-manager'

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
  pageId: string          // 关联的页面 ID
  containerId: string     // 缓存的容器 ID
  lastActiveAt: number // 上次激活时间戳
  willDownloadHandler?: (...args: any[]) => void // session 上的下载监听器引用（用于清理）
}

class WebviewManager {
  private sessionProxyEnabled = new Map<string, boolean>()
  private tabProxyOverride = new Map<string, string>() // tabId -> proxyId（临时代理覆盖）
  private views = new Map<string, ViewEntry>()
  private mainWindow: BrowserWindow | null = null
  private activeTabId: string | null = null
  private visibleTabIds = new Set<string>()
  private overlayVisible = true
  private multiBoundsActive = false
  private freezeTimer: ReturnType<typeof setInterval> | null = null
  private frozenTabUrls = new Map<string, { url: string; pageId: string; containerId: string }>() // 冻结的 tab 信息
  private pendingViews = new Map<string, { url: string; pageId: string; containerId: string }>() // 未激活的 tab（尚未创建 WebContentsView）
  private _freezeMinutes = 0
  private aria2Enabled = false // 缓存 aria2 接管下载的状态

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /** 设置 aria2 接管下载的状态（同步缓存） */
  setAria2Enabled(enabled: boolean): void {
    this.aria2Enabled = enabled
  }

  private getEffectiveProxy(pageId: string): Proxy | undefined {
    const page = getPageById(pageId)
    if (!page) return undefined
    const containerId = page.containerId || 'default'
    const container = getContainerById(containerId)
    const proxyId = page.proxyId ?? container?.proxyId ?? getGroupById(page.groupId)?.proxyId
    return proxyId ? getProxyById(proxyId) : undefined
  }

  private sendProxyInfo(tabId: string, payload: Record<string, unknown> | null): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('on:tab:proxy-info', tabId, payload)
  }

  private isSessionProxyEnabled(containerId: string): boolean {
    return this.sessionProxyEnabled.get(containerId) ?? false
  }

  private resolveProxyRuntimeState(tabId: string, entry: ViewEntry): {
    proxy?: Proxy
    isOverride: boolean
    proxyEnabled: boolean
    applied: boolean
    bindingText?: string
  } {
    const overrideProxyId = this.tabProxyOverride.get(tabId)
    let proxy: Proxy | undefined
    let isOverride = false

    if (overrideProxyId) {
      proxy = getProxyById(overrideProxyId)
      isOverride = !!proxy
    }

    if (!proxy) {
      proxy = this.getEffectiveProxy(entry.pageId)
    }

    if (!proxy) {
      return {
        isOverride: false,
        proxyEnabled: false,
        applied: false
      }
    }

    const proxyEnabled = proxy.enabled !== false
    const applied = isOverride
      ? proxyEnabled
      : proxyEnabled && this.isSessionProxyEnabled(entry.containerId)

    return {
      proxy,
      isOverride,
      proxyEnabled,
      applied,
      bindingText: this.getProxyBindingText(proxy)
    }
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

    // 优先使用临时代理覆盖
    const { proxy, isOverride, proxyEnabled, applied, bindingText } = this.resolveProxyRuntimeState(tabId, entry)

    if (!proxy) {
      this.sendProxyInfo(tabId, null)
      return
    }

    console.log('[WebviewManager] refreshProxyInfo', {
      tabId,
      pageId: entry.pageId,
      containerId: entry.containerId,
      proxyId: proxy.id,
      proxyName: proxy.name,
      proxyEnabled,
      applied,
      isOverride,
      sessionProxyEnabled: this.isSessionProxyEnabled(entry.containerId)
    })

    this.sendProxyInfo(tabId, {
      enabled: proxyEnabled,
      applied,
      name: proxy.name,
      text: bindingText,
      status: 'idle',
      proxyMode: proxy.proxyMode ?? 'global',
      proxyId: proxy.id,
      isOverride
    })
  }

  async detectProxyInfo(tabId: string): Promise<{ ok: boolean; ip?: string; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      this.sendProxyInfo(tabId, null)
      return { ok: false, error: '标签页不存在' }
    }

    // 优先使用临时代理覆盖
    const { proxy, isOverride, proxyEnabled, applied, bindingText } = this.resolveProxyRuntimeState(tabId, entry)

    if (!proxy) {
      this.sendProxyInfo(tabId, null)
      return { ok: false, error: '当前标签页未绑定代理' }
    }

    this.sendProxyInfo(tabId, {
      enabled: proxyEnabled,
      applied,
      name: proxy.name,
      text: bindingText,
      status: 'checking',
      proxyMode: proxy.proxyMode ?? 'global',
      proxyId: proxy.id,
      isOverride
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
        proxyMode: proxy.proxyMode ?? 'global',
        proxyId: proxy.id,
        isOverride
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
        proxyMode: proxy.proxyMode ?? 'global',
        proxyId: proxy.id,
        isOverride
      })
      return { ok: false, error: message }
    }
  }

  createView(tabId: string, pageId: string, url: string) {
    if (!this.mainWindow) return null

    // 内部页面不创建 WebContentsView
    if (url.startsWith('sessionbox://')) return null

    const page = getPageById(pageId)
    const containerId = page?.containerId || ''
    const container = containerId ? getContainerById(containerId) : undefined

    const proxyId = page?.proxyId ?? container?.proxyId ?? (page ? getGroupById(page.groupId)?.proxyId : undefined)
    const proxy = proxyId ? getProxyById(proxyId) : undefined
    const partition = containerId ? `persist:container-${containerId}` : ''

    const view = new WebContentsView({
      webPreferences: {
        partition: containerId ? partition : undefined
      }
    })

    // 始终设置 UA：自定义 > 默认 Chrome UA，避免暴露 Electron 标识
    view.webContents.setUserAgent(getUserAgent(page?.userAgent))

    registerBlockedProtocolHandlers(view.webContents.session)

    let applyProxyPromise: Promise<void> | null = null

    const shouldAutoApplyProxy = proxy
      && proxy.enabled !== false
      && container?.autoProxyEnabled === true

    console.log('[WebviewManager] createView proxy decision', {
      tabId,
      pageId,
      containerId,
      partition: partition || 'default',
      proxyId: proxy?.id ?? null,
      proxyName: proxy?.name ?? null,
      hasProxy: !!proxy,
      proxyEnabled: proxy?.enabled !== false,
      autoProxyEnabled: container?.autoProxyEnabled === true,
      shouldAutoApplyProxy
    })

    if (shouldAutoApplyProxy) {
      this.sessionProxyEnabled.set(containerId, true)
      applyProxyPromise = applyProxyToSession(view.webContents.session, proxy)
        .then(() => {
  
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
      // 代理配置存在但不自动应用（代理被禁用或容器未开启自动代理）
      this.sessionProxyEnabled.set(containerId, false)
      this.sendProxyInfo(tabId, {
        enabled: proxy.enabled !== false,
        applied: false,
        name: proxy.name,
        text: this.getProxyBindingText(proxy),
        status: 'idle',
        proxyMode: proxy.proxyMode ?? 'global'
      })
    } else {
      this.sendProxyInfo(tabId, null)
    }

    view.setVisible(false)
    this.mainWindow.contentView.addChildView(view)
    this.views.set(tabId, { view, tabId, pageId, containerId, lastActiveAt: Date.now() })
    this.setupEventForwarding(tabId, view)

    // 拦截 tab 内的快捷键（Ctrl+R、Ctrl+W 等）
    view.webContents.on('before-input-event', (event, input) => {
      if (handleBeforeInputEvent(input, view.webContents)) {
        event.preventDefault()
      }
    })

    const extensions = getExtensionsForContainer(containerId || null)
    extensions.addTab(view.webContents, this.mainWindow)

    void (async () => {
      try {
        if (applyProxyPromise) {
          await applyProxyPromise
        }
        await this.refreshProxyInfo(tabId)
        await ensureExtensionsLoadedForContainer(containerId || null)
        await view.webContents.loadURL(url)
      } catch (error) {
        console.error(`[WebviewManager] loadURL failed for tab ${tabId}:`, error)
      }
    })()

    return view.webContents
  }

  /** 注册待激活的标签（不创建 WebContentsView，激活时再创建） */
  registerPendingView(tabId: string, pageId: string, containerId: string, url: string): void {
    if (url.startsWith('sessionbox://')) return
    this.pendingViews.set(tabId, { url, pageId, containerId })
  }

  private ensureViewReady(tabId: string): ViewEntry | null {
    const existing = this.views.get(tabId)
    if (existing) return existing

    if (this.frozenTabUrls.has(tabId)) {
      const frozen = this.frozenTabUrls.get(tabId)!
      this.frozenTabUrls.delete(tabId)
      this.createView(tabId, frozen.pageId, frozen.url)
      this.mainWindow?.webContents.send('on:tab:frozen', tabId, false)
      return this.views.get(tabId) ?? null
    }

    if (this.pendingViews.has(tabId)) {
      const pending = this.pendingViews.get(tabId)!
      this.pendingViews.delete(tabId)
      this.createView(tabId, pending.pageId, pending.url)
      return this.views.get(tabId) ?? null
    }

    return null
  }

  private setupEventForwarding(tabId: string, view: WebContentsView): void {
    const wc = view.webContents
    const win = this.mainWindow
    if (!win) return

    const isWebUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file:///')
    const canSend = () => !win.isDestroyed()

    wc.setWindowOpenHandler(({ url }) => {
      if (!isWebUrl(url)) return { action: 'deny' }

      const entry = this.views.get(tabId)
      if (entry && canSend()) {
        win.webContents.send('on:tab:open-url', entry.pageId, url)
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
      this.checkAutoMute(tabId, url)
    })

    wc.on('did-navigate-in-page', (_event, url) => {
      if (canSend()) win.webContents.send('on:tab:url-updated', tabId, url)
      this.sendNavState(tabId)
      this.checkAutoMute(tabId, url)
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

    wc.on('focus', () => {
      const entry = this.views.get(tabId)
      if (!entry || !canSend()) return

      entry.lastActiveAt = Date.now()
      this.activeTabId = tabId

      win.webContents.send('on:tab:activated', tabId)
      void this.refreshProxyInfo(tabId)
    })

    // 右键菜单
    wc.on('context-menu', (_event, params) => {
      const menuItems = this.buildContextMenuItems(tabId, params)
      if (menuItems.length === 0) return

      const menu = Menu.buildFromTemplate(menuItems)
      menu.popup({ window: win })
    })

    // 拦截下载事件，转发到 aria2
    const willDownloadHandler = (event: Electron.Event, item: Electron.DownloadItem) => {
      // 同步检查缓存的 aria2 状态，必须同步调用 preventDefault 才能阻止默认保存对话框
      if (!this.aria2Enabled) return

      // 守卫：webContents 已销毁（标签页被关闭/冻结但 session 仍存活时，监听器仍会触发）
      // 必须在 preventDefault() 之前检查，否则下载既不会走默认保存也不会走 aria2
      if (wc.isDestroyed()) return

      event.preventDefault()
      const url = item.getURL()
      const filename = item.getFilename()
      const referer = wc.getURL()

      // 异步处理下载提交
      void (async () => {
        try {
          // 双重检查：实际确认 aria2 可用
          if (!(await checkConnection())) {
            console.warn('[Aria2] 连接不可用，下载未接管:', url)
            return
          }

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
      })()
    }

    wc.session.on('will-download', willDownloadHandler)

    // 保存 handler 引用，以便标签页销毁时从 session 上移除监听器
    const entry = this.views.get(tabId)
    if (entry) {
      entry.willDownloadHandler = willDownloadHandler
    }
  }

  private buildContextMenuItems(
    tabId: string,
    params: Electron.ContextMenuParams
  ): Electron.MenuItemConstructorOptions[] {
    const items: Electron.MenuItemConstructorOptions[] = []

    // 在新标签页打开链接
    if (params.linkURL) {
      items.push({
        label: '在新标签页中打开链接',
        click: () => {
          const entry = this.views.get(tabId)
          if (entry && this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('on:tab:open-url', entry.pageId, params.linkURL)
          }
        }
      })
    }

    // 复制链接地址
    if (params.linkURL) {
      items.push({
        label: '复制链接地址',
        click: () => {
          clipboard.writeText(params.linkURL)
        }
      })
    }

    // 复制图片 / 复制图片地址
    if (params.hasImageContents && params.srcURL) {
      items.push({
        label: '复制图片',
        click: () => {
          const entry = this.views.get(tabId)
          if (entry && !entry.view.webContents.isDestroyed()) {
            entry.view.webContents.copyImageAt(params.x, params.y)
          }
        }
      })
      items.push({
        label: '复制图片地址',
        click: () => {
          clipboard.writeText(params.srcURL)
        }
      })
    }

    // 复制选中的文本
    if (params.selectionText) {
      items.push({
        label: '复制',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          const entry = this.views.get(tabId)
          if (entry && !entry.view.webContents.isDestroyed()) {
            entry.view.webContents.copy()
          }
        }
      })
    }

    // 如果有链接又有其他内容，加分割线
    if (params.linkURL && items.length > 2) {
      items.splice(2, 0, { type: 'separator' })
    }

    return items
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
    // 清理待激活记录
    this.pendingViews.delete(tabId)
    this.tabProxyOverride.delete(tabId)
    this.visibleTabIds.delete(tabId)

    const entry = this.views.get(tabId)
    if (!entry) {
      // 也清理冻结记录
      this.frozenTabUrls.delete(tabId)
      return
    }

    this.views.delete(tabId)

    try {
      // 清理 session 上的 will-download 监听器（防止标签页销毁后仍触发回调）
      if (entry.willDownloadHandler && !entry.view.webContents.isDestroyed()) {
        entry.view.webContents.session.removeListener('will-download', entry.willDownloadHandler)
      }

      const extensions = getExtensionsForContainer(entry.containerId || null)
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

    const target = this.ensureViewReady(tabId)
    if (!target) {
      this.activeTabId = null
      return
    }

    target.lastActiveAt = Date.now()
    this.activeTabId = tabId
    if (!this.multiBoundsActive) {
      this.visibleTabIds = new Set([tabId])
    }

    const extensions = getExtensionsForContainer(target.containerId || null)
    extensions.selectTab(target.view.webContents)

    this.mainWindow.webContents.send('on:tab:activated', tabId)
    this.mainWindow.webContents.send('on:tab:request-bounds')
    void this.refreshProxyInfo(tabId)
  }

  updateBounds(rect: { x: number; y: number; width: number; height: number }): void {
    if (!this.activeTabId) return

    const entry = this.views.get(this.activeTabId)
    if (!entry) return

    this.multiBoundsActive = false
    this.visibleTabIds = new Set([this.activeTabId])

    entry.view.setBounds(rect)
    entry.view.setVisible(this.overlayVisible)
    entry.lastActiveAt = Date.now()

    for (const [id, otherEntry] of this.views) {
      if (id === this.activeTabId) continue

      otherEntry.view.setVisible(false)
      otherEntry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }

  /** Update bounds for multiple visible views simultaneously (split-screen mode) */
  updateMultiBounds(paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>): void {
    if (!this.mainWindow) return

    this.multiBoundsActive = true
    const visibleTabIds = new Set<string>()

    // Show and position all pane views
    for (const { tabId, rect } of paneBounds) {
      const entry = this.ensureViewReady(tabId)
      if (entry) {
        visibleTabIds.add(tabId)
        entry.view.setBounds(rect)
        entry.view.setVisible(this.overlayVisible)
        entry.lastActiveAt = Date.now()
      }
    }

    this.visibleTabIds = visibleTabIds

    // Hide views not in any pane
    for (const [id, entry] of this.views) {
      if (!visibleTabIds.has(id)) {
        entry.view.setVisible(false)
        entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
  }

  /** Set visibility of a specific view by tabId */
  setViewVisible(tabId: string, visible: boolean): void {
    const entry = this.views.get(tabId)
    if (entry) {
      entry.view.setVisible(visible)
    }
  }

  navigate(tabId: string, url: string): void {
    // 内部页面不加载到 WebContentsView
    if (url.startsWith('sessionbox://')) return
    // 如果标签尚未创建 View，更新待加载的 URL
    const pending = this.pendingViews.get(tabId)
    if (pending) {
      pending.url = url
      return
    }
    const entry = this.views.get(tabId)
    if (entry) {
      void entry.view.webContents.loadURL(url)
    }
  }

  /** 获取当前活跃标签页 ID */
  getActiveTabId(): string | null {
    return this.activeTabId
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

    const proxy = this.getEffectiveProxy(entry.pageId)
    if (!proxy) {
      this.sendProxyInfo(tabId, null)
      return { ok: false, enabled: false, error: '当前标签页未绑定代理' }
    }

    // 代理配置被禁用时，不允许开启
    if (enabled && proxy.enabled === false) {
      return { ok: false, enabled: false, error: '代理配置已被禁用' }
    }

    const relatedTabIds = this.getTabIdsByContainer(entry.containerId)
    this.sessionProxyEnabled.set(entry.containerId, enabled)

    console.log('[WebviewManager] setProxyEnabledForTab', {
      tabId,
      pageId: entry.pageId,
      containerId: entry.containerId,
      proxyId: proxy.id,
      proxyName: proxy.name,
      enabled,
      relatedTabIds
    })

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
      this.sessionProxyEnabled.set(entry.containerId, !enabled)
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

  /** 为指定标签页临时应用代理（null 表示恢复原始代理） */
  async applyProxyToTab(tabId: string, proxyId: string | null): Promise<{ ok: boolean; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      return { ok: false, error: '标签页不存在' }
    }

    const session = entry.view.webContents.session

    try {
      if (proxyId) {
        const proxy = getProxyById(proxyId)
        if (!proxy) {
          return { ok: false, error: '代理不存在' }
        }
        console.log('[WebviewManager] applyProxyToTab override', {
          tabId,
          pageId: entry.pageId,
          containerId: entry.containerId,
          proxyId,
          proxyName: proxy.name
        })
        this.tabProxyOverride.set(tabId, proxyId)
        await applyProxyToSession(session, proxy)
      } else {
        this.tabProxyOverride.delete(tabId)
        const effectiveProxy = this.getEffectiveProxy(entry.pageId)
        console.log('[WebviewManager] applyProxyToTab reset', {
          tabId,
          pageId: entry.pageId,
          containerId: entry.containerId,
          effectiveProxyId: effectiveProxy?.id ?? null,
          effectiveProxyName: effectiveProxy?.name ?? null,
          sessionProxyEnabled: this.isSessionProxyEnabled(entry.containerId)
        })
        if (effectiveProxy && this.isSessionProxyEnabled(entry.containerId)) {
          await applyProxyToSession(session, effectiveProxy)
        } else {
          await applyProxyToSession(session, null)
        }
      }

      await this.refreshProxyInfo(tabId)
      this.reload(tabId)

      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  openDevTools(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.openDevTools()
    }
  }

  setOverlayVisible(visible: boolean): void {
    this.overlayVisible = visible

    const targetTabIds = this.visibleTabIds.size > 0
      ? this.visibleTabIds
      : this.activeTabId
        ? new Set([this.activeTabId])
        : new Set<string>()

    for (const tabId of targetTabIds) {
      const entry = this.views.get(tabId)
      if (!entry) continue

      entry.view.setVisible(visible)
    }
  }

  destroyAll(): void {
    const tabIds = [...this.views.keys()]
    for (const tabId of tabIds) {
      this.destroyView(tabId)
    }
    this.visibleTabIds.clear()
    this.multiBoundsActive = false
  }

  getTabIdsByContainer(containerId: string): string[] {
    const result: string[] = []
    for (const [tabId, entry] of this.views) {
      if (entry.containerId === containerId) {
        result.push(tabId)
      }
    }
    return result
  }

  getViewInfo(tabId: string): { url: string; pageId: string; containerId: string } | null {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null

    return {
      url: entry.view.webContents.getURL(),
      pageId: entry.pageId,
      containerId: entry.containerId
    }
  }

  getWebContents(tabId: string) {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null
    return entry.view.webContents
  }

  /** 截取单个标签页的缩略图，返回 data URL 或 null（冻结/不可用时） */
  async captureTab(tabId: string): Promise<string | null> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null

    try {
      const image = await entry.view.webContents.capturePage()
      if (image.isEmpty()) return null
      const resized = image.resize({ width: 320 })
      return resized.toDataURL()
    } catch {
      return null
    }
  }

  /** 批量截取多个标签页的缩略图，每批 4 个避免 GPU 过载 */
  async captureTabs(tabIds: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>()
    const batchSize = 4
    for (let i = 0; i < tabIds.length; i += batchSize) {
      const batch = tabIds.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (id) => {
          results.set(id, await this.captureTab(id))
        })
      )
    }
    return results
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
   * 获取指定容器 partition 下当前活动 tab 的 ID。
   * containerId 为 null 时返回默认 session 的活动 tab ID。
   */
  getActiveTabIdByContainer(containerId: string | null): string | null {
    for (const [tabId, entry] of this.views) {
      if (entry.containerId === (containerId ?? '')) {
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
      this.frozenTabUrls.set(tabId, { url, pageId: entry.pageId, containerId: entry.containerId })

      // 销毁 view 但保留 tab 数据
      try {
        // 清理 session 上的 will-download 监听器
        if (entry.willDownloadHandler && !entry.view.webContents.isDestroyed()) {
          entry.view.webContents.session.removeListener('will-download', entry.willDownloadHandler)
        }

        const extensions = getExtensionsForContainer(entry.containerId || null)
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

  /** 检查 URL 是否匹配静音网站列表，匹配则自动静音 */
  private checkAutoMute(tabId: string, url: string): void {
    try {
      const hostname = new URL(url).hostname
      const mutedSites = getMutedSites()
      if (mutedSites.some((site) => hostname === site || hostname.endsWith(`.${site}`))) {
        this.setAudioMuted(tabId, true)
        // 通知渲染进程更新 tab 的 muted 状态
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('on:tab:auto-muted', tabId)
        }
      }
    } catch {
      // URL 解析失败，忽略
    }
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
