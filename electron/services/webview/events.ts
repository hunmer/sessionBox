import type { BrowserWindow, WebContentsView } from 'electron'
import type { ViewEntry } from './types'
import { clipboard, Menu } from 'electron'
import { getSnifferDomains, getMutedSites } from '../store'
import { handleBeforeInputEvent } from '../shortcut-manager'
import { cacheFaviconFromUrl } from '../favicon-cache'
import { pluginEventBus, broadcastToRenderer } from '../plugin-event-bus'
import { addDownload, checkConnection } from '../aria2'

export function setupEventForwarding(
  tabId: string,
  view: WebContentsView,
  mainWindow: BrowserWindow,
  views: Map<string, ViewEntry>,
  snifferEnabled: Map<string, boolean>,
  onStartSniffing: (tabId: string) => void,
  aria2Enabled: () => boolean
): ((...args: any[]) => void) | undefined {
  const wc = view.webContents
  const win = mainWindow

  const isWebUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file:///')
  const canSend = () => !win.isDestroyed()

  // 自动嗅探
  const autoSniff = (url: string) => {
    if (snifferEnabled.get(tabId)) return
    try {
      const hostname = new URL(url).hostname
      const domains: string[] = getSnifferDomains()
      if (domains.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
        snifferEnabled.set(tabId, true)
        onStartSniffing(tabId)
      }
    } catch {
      // URL 解析失败，忽略
    }
  }

  wc.setWindowOpenHandler(({ url }) => {
    if (!isWebUrl(url)) return { action: 'deny' }
    const entry = views.get(tabId)
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

  const onNavState = () => {
    const entry = views.get(tabId)
    if (!entry || !canSend()) return
    win.webContents.send('on:tab:nav-state', tabId, {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      isLoading: wc.isLoading()
    })
  }

  const checkAutoMute = (url: string) => {
    try {
      const hostname = new URL(url).hostname
      const mutedSites = getMutedSites()
      if (mutedSites.some((site) => hostname === site || hostname.endsWith(`.${site}`))) {
        const entry = views.get(tabId)
        if (entry && !entry.view.webContents.isDestroyed()) {
          entry.view.webContents.setAudioMuted(true)
        }
        if (canSend()) {
          win.webContents.send('on:tab:auto-muted', tabId)
        }
      }
    } catch {
      // URL 解析失败，忽略
    }
  }

  wc.on('did-navigate', (_event, url) => {
    pluginEventBus.emit('tab:navigated', { tabId, url })
    if (canSend()) win.webContents.send('on:tab:url-updated', tabId, url)
    onNavState()
    checkAutoMute(url)
    autoSniff(url)
  })

  wc.on('did-navigate-in-page', (_event, url) => {
    if (canSend()) win.webContents.send('on:tab:url-updated', tabId, url)
    onNavState()
    checkAutoMute(url)
    autoSniff(url)
  })

  wc.on('did-start-loading', () => onNavState())
  wc.on('did-stop-loading', () => onNavState())
  wc.on('did-fail-load', () => {})
  wc.on('render-process-gone', () => {})
  wc.on('did-finish-load', () => {})

  wc.on('page-favicon-updated', async (_event, favicons) => {
    if (favicons.length > 0 && canSend()) {
      const faviconUrl = favicons[0]
      const pageUrl = wc.getURL()
      let domain = ''
      try { domain = new URL(pageUrl).hostname } catch { /* 忽略无效 URL */ }

      if (domain) {
        const saved = await cacheFaviconFromUrl(faviconUrl, domain)
        if (saved) {
          win.webContents.send('on:tab:favicon-updated', tabId, `site-icon://${domain}`)
          return
        }
      }
      win.webContents.send('on:tab:favicon-updated', tabId, faviconUrl)
    }
  })

  wc.on('focus', () => {
    const entry = views.get(tabId)
    if (!entry || !canSend()) return
    entry.lastActiveAt = Date.now()
  })

  // 右键菜单
  wc.on('context-menu', (_event, params) => {
    const menuItems = buildContextMenuItems(tabId, params, views, mainWindow)
    if (menuItems.length === 0) return
    const menu = Menu.buildFromTemplate(menuItems)
    menu.popup({ window: win })
  })

  // 拦截下载事件
  const willDownloadHandler = (event: Electron.Event, item: Electron.DownloadItem) => {
    if (!aria2Enabled()) return
    if (wc.isDestroyed()) return

    event.preventDefault()
    const url = item.getURL()
    const filename = item.getFilename()
    const referer = wc.getURL()

    void (async () => {
      try {
        if (!(await checkConnection())) {
          console.warn('[Aria2] 连接不可用，下载未接管:', url)
          return
        }

        const cookies = await wc.session.cookies.get({ url })
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

        if (cookieStr) {
          await addDownload(url, { filename, referer, cookies: cookieStr, headers: [] })
        } else {
          await addDownload(url, { filename, referer })
        }
        if (canSend()) win.webContents.send('on:download:started', { url, filename, tabId })
      } catch (e) {
        console.error('[Aria2] 添加下载失败:', e)
      }
    })()
  }

  wc.session.on('will-download', willDownloadHandler)

  return willDownloadHandler
}

function buildContextMenuItems(
  tabId: string,
  params: Electron.ContextMenuParams,
  views: Map<string, ViewEntry>,
  mainWindow: BrowserWindow | null
): Electron.MenuItemConstructorOptions[] {
  const items: Electron.MenuItemConstructorOptions[] = []

  if (params.linkURL) {
    items.push({
      label: '在新标签页中打开链接',
      click: () => {
        const entry = views.get(tabId)
        if (entry && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('on:tab:open-url', entry.pageId, params.linkURL)
        }
      }
    })
    items.push({
      label: '复制链接地址',
      click: () => clipboard.writeText(params.linkURL)
    })
  }

  if (params.hasImageContents && params.srcURL) {
    items.push({
      label: '复制图片',
      click: () => {
        const entry = views.get(tabId)
        if (entry && !entry.view.webContents.isDestroyed()) {
          entry.view.webContents.copyImageAt(params.x, params.y)
        }
      }
    })
    items.push({
      label: '复制图片地址',
      click: () => clipboard.writeText(params.srcURL)
    })
  }

  if (params.selectionText) {
    items.push({
      label: '复制',
      accelerator: 'CmdOrCtrl+C',
      click: () => {
        const entry = views.get(tabId)
        if (entry && !entry.view.webContents.isDestroyed()) {
          entry.view.webContents.copy()
        }
      }
    })
  }

  if (params.linkURL && items.length > 2) {
    items.splice(2, 0, { type: 'separator' })
  }

  return items
}
