import { BrowserWindow, WebContentsView, webContents } from 'electron'
import { ensureExtensionsLoadedForContainer, getExtensionsForContainer } from './extensions'
import { getPageById, getContainerById, getGroupById, getProxyById, getZoomPreference, getTabImplementation, type Proxy, type TabImplementation } from './store'
import { applyProxyToSession } from './proxy'
import { getUserAgent, installClientHintsRewrite } from '../utils/user-agent'
import { broadcastToRenderer, pluginEventBus } from './plugin-event-bus'
import { handleBeforeInputEvent } from './shortcut-manager'

import type { ViewEntry, FrozenTabInfo, PendingViewInfo } from './webview/types'
import { BLOCKED_SCHEMES } from './webview/blocked-protocols'
import { registerBlockedProtocolHandlers } from './webview/blocked-protocols'
import {
  getEffectiveProxy,
  getProxyBindingText,
  resolveProxyRuntimeState,
  sendProxyInfo,
  refreshProxyInfo as doRefreshProxyInfo,
  detectProxyInfo as doDetectProxyInfo
} from './webview/proxy'
import { setupEventForwarding } from './webview/events'
import { freezeView } from './webview/freeze'
import { startSniffing, cleanupSessionSniffer } from './webview/sniffer'
import {
  getZoomLevel as doGetZoomLevel,
  zoomIn as doZoomIn,
  zoomOut as doZoomOut,
  zoomReset as doZoomReset,
  saveZoomPreference,
  restoreZoomLevel as doRestoreZoomLevel
} from './webview/zoom'
import { BrowserContentTabView, WebviewTabView, type BaseTabView } from './webview/tab-view'

export { BLOCKED_SCHEMES }

// 为渲染层边缘缩放把手让出命中区域，避免被 WebContentsView 覆盖。
const WINDOW_RESIZE_GUTTER = 6

class WebviewManager {
  private sessionProxyEnabled = new Map<string, boolean>()
  private tabProxyOverride = new Map<string, string>()
  private views = new Map<string, ViewEntry>()
  private mainWindow: BrowserWindow | null = null
  private activeTabId: string | null = null
  private visibleTabIds = new Set<string>()
  private overlayVisible = true
  private multiBoundsActive = false
  private freezeTimer: ReturnType<typeof setInterval> | null = null
  private frozenTabUrls = new Map<string, FrozenTabInfo>()
  private pendingViews = new Map<string, PendingViewInfo>()
  private requestedWebviews = new Map<string, PendingViewInfo>()
  private _freezeMinutes = 0
  private aria2Enabled = false
  private snifferEnabled = new Map<string, boolean>()
  private sessionSnifferInstalled = new Set<string>()
  private tabImplementation: TabImplementation = 'webview'

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
    this.tabImplementation = getTabImplementation()
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private reserveResizeGutter(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    const win = this.mainWindow
    if (!win || win.isDestroyed()) return rect
    const content = win.getContentBounds()
    const result = { ...rect }
    if (rect.x + rect.width >= content.width) {
      result.width = Math.max(1, rect.width - WINDOW_RESIZE_GUTTER)
    }
    if (rect.y + rect.height >= content.height) {
      result.height = Math.max(1, rect.height - WINDOW_RESIZE_GUTTER)
    }
    return result
  }

  setAria2Enabled(enabled: boolean): void {
    this.aria2Enabled = enabled
  }

  // ====== 代理管理 ======

  async refreshProxyInfo(tabId: string): Promise<void> {
    const entry = this.views.get(tabId)
    if (!entry) return
    await doRefreshProxyInfo(this.mainWindow, tabId, entry, this.sessionProxyEnabled, this.tabProxyOverride)
  }

  async detectProxyInfo(tabId: string): Promise<{ ok: boolean; ip?: string; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry) return { ok: false, error: '标签页不存在' }
    return doDetectProxyInfo(this.mainWindow, tabId, entry, this.sessionProxyEnabled, this.tabProxyOverride)
  }

  async setProxyEnabledForTab(tabId: string, enabled: boolean): Promise<{ ok: boolean; enabled: boolean; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      return { ok: false, enabled, error: '标签页不存在' }
    }

    const proxy = getEffectiveProxy(entry.pageId)
    if (!proxy) {
      sendProxyInfo(this.mainWindow, tabId, null)
      return { ok: false, enabled: false, error: '当前标签页未绑定代理' }
    }

    if (enabled && proxy.enabled === false) {
      return { ok: false, enabled: false, error: '代理配置已被禁用' }
    }

    const relatedTabIds = this.getTabIdsByContainer(entry.containerId)
    this.sessionProxyEnabled.set(entry.containerId, enabled)

    console.log('[WebviewManager] setProxyEnabledForTab', {
      tabId, pageId: entry.pageId, containerId: entry.containerId,
      proxyId: proxy.id, proxyName: proxy.name, enabled, relatedTabIds
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

  async applyProxyToTab(tabId: string, proxyId: string | null): Promise<{ ok: boolean; error?: string }> {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) {
      return { ok: false, error: '标签页不存在' }
    }

    const session = entry.view.webContents.session

    try {
      if (proxyId) {
        const proxy = getProxyById(proxyId)
        if (!proxy) return { ok: false, error: '代理不存在' }

        console.log('[WebviewManager] applyProxyToTab override', {
          tabId, pageId: entry.pageId, containerId: entry.containerId,
          proxyId, proxyName: proxy.name
        })
        this.tabProxyOverride.set(tabId, proxyId)
        await applyProxyToSession(session, proxy)
      } else {
        this.tabProxyOverride.delete(tabId)
        const effectiveProxy = getEffectiveProxy(entry.pageId)
        console.log('[WebviewManager] applyProxyToTab reset', {
          tabId, pageId: entry.pageId, containerId: entry.containerId,
          effectiveProxyId: effectiveProxy?.id ?? null,
          effectiveProxyName: effectiveProxy?.name ?? null,
          sessionProxyEnabled: this.sessionProxyEnabled.get(entry.containerId)
        })
        if (effectiveProxy && this.sessionProxyEnabled.get(entry.containerId)) {
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

  // ====== 视图创建与销毁 ======

  private requestWebview(tabId: string, request: PendingViewInfo): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    const page = getPageById(request.pageId)
    this.requestedWebviews.set(tabId, request)
    this.mainWindow.webContents.send('on:tab-webview:create', {
      tabId,
      partition: request.containerId ? `persist:container-${request.containerId}` : '',
      userAgent: getUserAgent(page?.userAgent)
    })
  }

  createView(tabId: string, pageId: string, url: string, containerOverride?: string, lastNonAuthUrl?: string) {
    if (!this.mainWindow) return null
    if (url.startsWith('sessionbox://')) return null

    const page = getPageById(pageId)
    const containerId = containerOverride || page?.containerId || ''
    const partition = containerId ? `persist:container-${containerId}` : ''

    if (this.tabImplementation === 'webview') {
      this.requestWebview(tabId, { url, pageId, containerId, lastNonAuthUrl })
      return null
    }

    const nativeView = new WebContentsView({
      webPreferences: {
        partition: containerId ? partition : undefined
      }
    })
    const view = new BrowserContentTabView(tabId, nativeView, this.mainWindow)
    this.initializeView(tabId, pageId, url, containerId, view, lastNonAuthUrl)
    return view.webContents
  }

  attachWebview(tabId: string, webContentsId: number): boolean {
    if (!this.mainWindow || this.tabImplementation !== 'webview') {
      console.warn('[WebviewManager] attachWebview rejected: implementation unavailable', { tabId, webContentsId })
      return false
    }
    if (this.views.has(tabId)) return true

    const request = this.requestedWebviews.get(tabId)
    const guest = webContents.fromId(webContentsId)
    if (!request || !guest || guest.isDestroyed()) {
      console.warn('[WebviewManager] attachWebview deferred', {
        tabId,
        webContentsId,
        hasRequest: !!request,
        hasGuest: !!guest,
        guestDestroyed: guest?.isDestroyed() ?? null
      })
      return false
    }

    this.requestedWebviews.delete(tabId)
    console.log('[WebviewManager] attachWebview accepted', { tabId, webContentsId, url: request.url })
    const view = new WebviewTabView(tabId, guest, this.mainWindow)
    this.initializeView(tabId, request.pageId, request.url, request.containerId, view, request.lastNonAuthUrl)

    let recoveryUrl = request.url
    guest.on('did-navigate', (_event, url) => { recoveryUrl = url })
    guest.on('did-navigate-in-page', (_event, url) => { recoveryUrl = url })
    guest.once('destroyed', () => {
      const entry = this.views.get(tabId)
      if (!entry || entry.view.webContents !== guest) return

      this.views.delete(tabId)
      this.requestWebview(tabId, {
        ...request,
        url: recoveryUrl,
        lastNonAuthUrl: entry.lastNonAuthUrl
      })
    })

    if (this.activeTabId === tabId) {
      this.switchView(tabId)
    }
    return true
  }

  getRequestedWebviews(): Array<{ tabId: string; partition: string; userAgent: string }> {
    return [...this.requestedWebviews].map(([tabId, request]) => {
      const page = getPageById(request.pageId)
      return {
        tabId,
        partition: request.containerId ? `persist:container-${request.containerId}` : '',
        userAgent: getUserAgent(page?.userAgent)
      }
    })
  }

  private initializeView(
    tabId: string,
    pageId: string,
    url: string,
    containerId: string,
    view: BaseTabView,
    lastNonAuthUrl?: string
  ): void {
    if (!this.mainWindow) return

    const page = getPageById(pageId)
    const container = containerId ? getContainerById(containerId) : undefined

    const proxyId = page?.proxyId ?? container?.proxyId ?? (page ? getGroupById(page.groupId)?.proxyId : undefined)
    const proxy = proxyId ? getProxyById(proxyId) : undefined
    const partition = containerId ? `persist:container-${containerId}` : ''

    view.webContents.setUserAgent(getUserAgent(page?.userAgent))
    installClientHintsRewrite(view.webContents.session)
    registerBlockedProtocolHandlers(view.webContents.session)

    let applyProxyPromise: Promise<void> | null = null
    const shouldAutoApplyProxy = proxy && proxy.enabled !== false && container?.autoProxyEnabled === true

    console.log('[WebviewManager] createView proxy decision', {
      tabId, pageId, containerId, partition: partition || 'default',
      proxyId: proxy?.id ?? null, proxyName: proxy?.name ?? null,
      hasProxy: !!proxy, proxyEnabled: proxy?.enabled !== false,
      autoProxyEnabled: container?.autoProxyEnabled === true, shouldAutoApplyProxy
    })

    if (shouldAutoApplyProxy) {
      this.sessionProxyEnabled.set(containerId, true)
      applyProxyPromise = applyProxyToSession(view.webContents.session, proxy!)
        .catch((error) => {
          console.error('[WebviewManager] setProxy failed', {
            tabId, partition: partition || 'default',
            proxyMode: proxy!.proxyMode ?? 'global',
            message: error instanceof Error ? error.message : String(error)
          })
        })
    } else if (proxy) {
      this.sessionProxyEnabled.set(containerId, false)
      sendProxyInfo(this.mainWindow, tabId, {
        enabled: proxy.enabled !== false,
        applied: false,
        name: proxy.name,
        text: getProxyBindingText(proxy),
        status: 'idle',
        proxyMode: proxy.proxyMode ?? 'global'
      })
    } else {
      sendProxyInfo(this.mainWindow, tabId, null)
    }

    view.setVisible(false)

    const isGoogleAuth = (() => {
      try {
        const hostname = new URL(url).hostname.toLowerCase()
        return hostname === 'accounts.google.com' || hostname === 'accounts.google.cn'
      } catch {
        return false
      }
    })()
    const entry: ViewEntry = {
      view,
      tabId,
      pageId,
      containerId,
      lastActiveAt: Date.now(),
      lastNonAuthUrl: lastNonAuthUrl || (isGoogleAuth ? undefined : url)
    }
    this.views.set(tabId, entry)
    pluginEventBus.emit('tab:created', { tabId, pageId, url })

    // 设置事件转发（will-download 在 session 级去重注册，见 events.ts）
    setupEventForwarding(
      tabId, view, this.mainWindow, this.views,
      this.snifferEnabled,
      (tid) => this.startSniffingInternal(tid),
      () => this.aria2Enabled
    )

    if (this.snifferEnabled.get(tabId)) this.startSniffingInternal(tabId)

    // 拦截快捷键
    view.webContents.on('before-input-event', (event, input) => {
      if (handleBeforeInputEvent(input, view.webContents)) {
        event.preventDefault()
      }
    })

    const extensions = getExtensionsForContainer(containerId || null)
    extensions.addTab(view.webContents, this.mainWindow)

    // 恢复缩放偏好
    const savedZoom = getZoomPreference(pageId)
    if (savedZoom !== undefined && savedZoom !== 0) {
      view.webContents.setZoomLevel(savedZoom)
    }

    void (async () => {
      try {
        if (applyProxyPromise) await applyProxyPromise
        await this.refreshProxyInfo(tabId)
        await ensureExtensionsLoadedForContainer(containerId || null)
        console.log('[WebviewManager] loadURL started', { tabId, url })
        await view.webContents.loadURL(url)
        console.log('[WebviewManager] loadURL completed', { tabId, url: view.webContents.getURL() })
      } catch (error) {
        console.error(`[WebviewManager] loadURL failed for tab ${tabId}:`, error)
      }
    })()

  }

  registerPendingView(tabId: string, pageId: string, containerId: string, url: string, lastNonAuthUrl?: string): void {
    if (url.startsWith('sessionbox://')) return
    this.pendingViews.set(tabId, { url, pageId, containerId, lastNonAuthUrl })
  }

  private ensureViewReady(tabId: string): ViewEntry | null {
    const existing = this.views.get(tabId)
    if (existing) return existing

    if (this.frozenTabUrls.has(tabId)) {
      const frozen = this.frozenTabUrls.get(tabId)!
      this.frozenTabUrls.delete(tabId)
      this.createView(tabId, frozen.pageId, frozen.url)
      if (frozen.snifferEnabled) {
        this.snifferEnabled.set(tabId, true)
        this.startSniffingInternal(tabId)
      }
      broadcastToRenderer('on:tab:frozen', tabId, false)
      pluginEventBus.emit('tab:unfrozen', { tabId })
      this.mainWindow?.webContents.send('on:tab:frozen', tabId, false)
      return this.views.get(tabId) ?? null
    }

    if (this.pendingViews.has(tabId)) {
      const pending = this.pendingViews.get(tabId)!
      this.pendingViews.delete(tabId)
      this.createView(tabId, pending.pageId, pending.url, pending.containerId || undefined, pending.lastNonAuthUrl)
      return this.views.get(tabId) ?? null
    }

    return null
  }

  destroyView(tabId: string): void {
    pluginEventBus.emit('tab:closed', { tabId })
    this.pendingViews.delete(tabId)
    const requestedWebview = this.requestedWebviews.delete(tabId)
    if (requestedWebview && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('on:tab-webview:destroy', { tabId })
    }
    this.tabProxyOverride.delete(tabId)
    this.visibleTabIds.delete(tabId)
    this.snifferEnabled.delete(tabId)

    const entry = this.views.get(tabId)
    if (!entry) {
      this.frozenTabUrls.delete(tabId)
      return
    }

    this.views.delete(tabId)

    try {
      const extensions = getExtensionsForContainer(entry.containerId || null)
      if (!entry.view.webContents.isDestroyed()) {
        extensions.removeTab(entry.view.webContents)
      }

      const mainWindow = this.mainWindow
      if (mainWindow && !mainWindow.isDestroyed()) {
        entry.view.destroy()
      }

      cleanupSessionSniffer(entry.containerId, this.snifferEnabled, this.views, this.sessionSnifferInstalled)
    } catch {
      // 关闭过程中忽略 Electron 已销毁异常。
    }

    if (this.activeTabId === tabId) {
      this.activeTabId = null
    }

    sendProxyInfo(this.mainWindow, tabId, null)
  }

  private hideAllViews(): void {
    this.visibleTabIds.clear()
    this.multiBoundsActive = false
    for (const [, entry] of this.views) {
      entry.view.setVisible(false)
      entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }

  // ====== 视图切换与布局 ======

  switchView(tabId: string): void {
    if (!this.mainWindow) return

    this.activeTabId = tabId || null
    const target = this.ensureViewReady(tabId)
    if (!target) {
      this.hideAllViews()
      if (tabId && this.requestedWebviews.has(tabId)) return
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

    broadcastToRenderer('on:tab:activated', tabId)
    const activatedPage = getPageById(target.pageId)
    pluginEventBus.emit('tab:activated', { tabId, pageId: target.pageId, groupId: activatedPage?.groupId ?? null })
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

    entry.view.setBounds(this.reserveResizeGutter(rect))
    entry.view.setVisible(this.overlayVisible)
    entry.lastActiveAt = Date.now()

    for (const [id, otherEntry] of this.views) {
      if (id === this.activeTabId) continue
      otherEntry.view.setVisible(false)
      otherEntry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }

  updateMultiBounds(paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>): void {
    if (!this.mainWindow) return

    this.multiBoundsActive = true
    const visibleTabIds = new Set<string>()

    for (const { tabId, rect } of paneBounds) {
      const entry = this.ensureViewReady(tabId)
      if (entry) {
        visibleTabIds.add(tabId)
        entry.view.setBounds(this.reserveResizeGutter(rect))
        entry.view.setVisible(this.overlayVisible)
        entry.lastActiveAt = Date.now()
      }
    }

    this.visibleTabIds = visibleTabIds

    for (const [id, entry] of this.views) {
      if (!visibleTabIds.has(id)) {
        entry.view.setVisible(false)
        entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
  }

  setViewVisible(tabId: string, visible: boolean): void {
    const entry = this.views.get(tabId)
    if (entry) entry.view.setVisible(visible)
  }

  setOverlayVisible(visible: boolean): void {
    const effectiveVisible = this.tabImplementation === 'webview' ? true : visible
    this.overlayVisible = effectiveVisible
    const targetTabIds = this.visibleTabIds.size > 0
      ? this.visibleTabIds
      : this.activeTabId ? new Set([this.activeTabId]) : new Set<string>()

    for (const tabId of targetTabIds) {
      const entry = this.views.get(tabId)
      if (entry) entry.view.setVisible(effectiveVisible)
    }
  }

  destroyAll(): void {
    const tabIds = [...this.views.keys()]
    for (const tabId of tabIds) {
      this.destroyView(tabId)
    }
    for (const tabId of this.requestedWebviews.keys()) {
      this.mainWindow?.webContents.send('on:tab-webview:destroy', { tabId })
    }
    this.requestedWebviews.clear()
    this.visibleTabIds.clear()
    this.multiBoundsActive = false
  }

  // ====== 导航 ======

  navigate(tabId: string, url: string): void {
    if (url.startsWith('sessionbox://')) return
    const pending = this.pendingViews.get(tabId)
    if (pending) {
      pending.url = url
      return
    }
    const entry = this.views.get(tabId)
    if (entry) void entry.view.webContents.loadURL(url)
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
    if (entry) entry.view.webContents.reload()
  }

  forceReload(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.reloadIgnoringCache()
    }
  }

  openDevTools(tabId: string): void {
    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.openDevTools()
    }
  }

  // ====== 缩放 ======

  getZoomLevel(tabId: string): number {
    return doGetZoomLevel(this.views.get(tabId))
  }

  zoomIn(tabId: string): void {
    doZoomIn(this.views.get(tabId), (tid, level) => saveZoomPreference(this.views.get(tid)))
  }

  zoomOut(tabId: string): void {
    doZoomOut(this.views.get(tabId), (tid, level) => saveZoomPreference(this.views.get(tid)))
  }

  zoomReset(tabId: string): void {
    doZoomReset(this.views.get(tabId), (tid, level) => saveZoomPreference(this.views.get(tid)))
  }

  restoreZoomLevel(tabId: string): void {
    doRestoreZoomLevel(this.views.get(tabId))
  }

  // ====== 冻结机制 ======

  setFreezeMinutes(minutes: number): void {
    this._freezeMinutes = minutes
    this.stopFreezeTimer()
    if (minutes > 0) this.startFreezeTimer()
  }

  private startFreezeTimer(): void {
    if (this.freezeTimer) return
    this.freezeTimer = setInterval(() => this.checkFreeze(), 30_000)
  }

  private stopFreezeTimer(): void {
    if (this.freezeTimer) {
      clearInterval(this.freezeTimer)
      this.freezeTimer = null
    }
  }

  private checkFreeze(): void {
    if (!this._freezeMinutes || !this.mainWindow || this.mainWindow.isDestroyed()) return

    const threshold = this._freezeMinutes * 60_000
    const now = Date.now()

    for (const [tabId, entry] of this.views) {
      if (tabId === this.activeTabId) continue
      if (now - entry.lastActiveAt < threshold) continue

      const url = entry.view.webContents.getURL()
      if (url.startsWith('sessionbox://')) continue

      const frozenInfo = freezeView(entry, this.mainWindow, this.snifferEnabled.get(tabId) ?? false)
      this.frozenTabUrls.set(tabId, frozenInfo)
      this.views.delete(tabId)
      this.snifferEnabled.delete(tabId)
    }
  }

  isFrozen(tabId: string): boolean {
    return this.frozenTabUrls.has(tabId)
  }

  // ====== 音频静音 ======

  setAudioMuted(tabId: string, muted: boolean): void {
    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.setAudioMuted(muted)
    }
  }

  // ====== 嗅探 ======

  toggleSniffer(tabId: string, enabled: boolean): void {
    this.snifferEnabled.set(tabId, enabled)
    if (enabled) {
      this.startSniffingInternal(tabId)
    }
  }

  private startSniffingInternal(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry) return
    startSniffing(entry, this.mainWindow, this.snifferEnabled, this.views, this.sessionSnifferInstalled)
  }

  isSnifferEnabled(tabId: string): boolean {
    return this.snifferEnabled.get(tabId) ?? false
  }

  // ====== 查询 ======

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  getTabIdsByContainer(containerId: string): string[] {
    const result: string[] = []
    for (const [tabId, entry] of this.views) {
      if (entry.containerId === containerId) result.push(tabId)
    }
    return result
  }

  getViewInfo(tabId: string): { url: string; pageId: string; containerId: string; lastNonAuthUrl?: string } | null {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null
    return {
      url: entry.view.webContents.getURL(),
      pageId: entry.pageId,
      containerId: entry.containerId,
      lastNonAuthUrl: entry.lastNonAuthUrl
    }
  }

  getWebContents(tabId: string) {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return null
    return entry.view.webContents
  }

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

  async captureTabs(tabIds: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>()
    const batchSize = 4
    for (let i = 0; i < tabIds.length; i += batchSize) {
      const batch = tabIds.slice(i, i + batchSize)
      await Promise.all(batch.map(async (id) => {
        results.set(id, await this.captureTab(id))
      }))
    }
    return results
  }

  getTabIdByWebContents(target: Electron.WebContents): string | null {
    for (const [tabId, entry] of this.views) {
      if (entry.view.webContents === target) return tabId
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

  getActiveTabIdByContainer(containerId: string | null): string | null {
    for (const [tabId, entry] of this.views) {
      if (entry.containerId === (containerId ?? '')) return tabId
    }
    return null
  }
}

export const webviewManager = new WebviewManager()
