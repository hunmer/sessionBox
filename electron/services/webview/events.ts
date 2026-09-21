import { BrowserWindow, clipboard, Menu } from 'electron'
import type { Session } from 'electron'
import type { ViewEntry } from './types'
import type { BaseTabView } from './tab-view'
import { getSnifferDomains, getMutedSites } from '../store'
import { handleBeforeInputEvent } from '../shortcut-manager'
import { cacheFaviconFromUrl } from '../favicon-cache'
import { pluginEventBus, broadcastToRenderer } from '../plugin-event-bus'
import { addDownload, checkConnection, getAria2Config, isAria2Fetchable } from '../aria2'
import { trackDownload } from '../system-downloads'
import { resolveDownloadPath } from '../download-path'
import { join } from 'path'

export function setupEventForwarding(
  tabId: string,
  view: BaseTabView,
  mainWindow: BrowserWindow,
  views: Map<string, ViewEntry>,
  snifferEnabled: Map<string, boolean>,
  onStartSniffing: (tabId: string) => void,
  aria2Enabled: () => boolean
): void {
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
    win.webContents.send('on:tab:focused', tabId)
  })

  // 右键菜单
  wc.on('context-menu', (_event, params) => {
    const menuItems = buildContextMenuItems(tabId, params, views, mainWindow)
    if (menuItems.length === 0) return
    const menu = Menu.buildFromTemplate(menuItems)
    menu.popup({ window: win })
  })

  // 下载拦截：同一 session 只注册一个处理器（多标签共享 session 时避免重复接管）
  ensureSessionDownloadHandler(wc.session, views, aria2Enabled)
}

/** 已注册下载拦截的 session，配合 WeakSet 去重 */
const downloadHandledSessions = new WeakSet<Session>()

/**
 * session 级 will-download 拦截。
 * 无容器标签共享默认 session、同容器标签共享 persist 分区，
 * 若按标签注册会一次下载触发 N 个处理器，产生 N 条重复记录。
 * will-download 回调的第三个参数即发起下载的 webContents，据此定位 referer 与标签。
 */
function ensureSessionDownloadHandler(
  session: Session,
  views: Map<string, ViewEntry>,
  aria2Enabled: () => boolean
): void {
  if (downloadHandledSessions.has(session)) return
  downloadHandledSessions.add(session)

  session.on('will-download', (event, item, wc) => {
    const url = item.getURL()
    const filename = item.getFilename()
    const config = getAria2Config()

    /** 回退到系统下载器：解析无冲突路径后预设保存路径，并纳入后台下载跟踪 */
    const fallbackToSystem = () => {
      if (!config.alwaysAsk && config.downloadDir) {
        try {
          // 分组目录 + 无冲突文件名（与 aria2 路径行为一致，应用默认分组模板）
          const resolved = resolveDownloadPath(config.downloadDir, filename, url, config.defaultCategory)
          // DownloadItem.setSavePath 接收完整路径，会自动创建中间目录
          item.setSavePath(join(resolved.dir, resolved.filename))
        } catch {
          // 设置失败则交给 Chromium 默认行为
        }
      }
      // 纳入系统下载跟踪：blob/data/空 URL 等也能在下载列表里看进度
      trackDownload(item)
    }

    // 未启用 aria2，或 URL 无法被 aria2 获取（blob:/data:/空等，仅存在于渲染进程内存中）
    if (!aria2Enabled() || !isAria2Fetchable(url)) {
      fallbackToSystem()
      return
    }
    if (wc.isDestroyed()) return

    event.preventDefault()
    const referer = wc.getURL()

    void (async () => {
      try {
        if (!(await checkConnection())) {
          console.warn('[Aria2] 连接不可用，回退到系统下载器:', url)
          // 连接失败：已 preventDefault，需手动用系统下载器兜底，避免文件丢失
          fallbackToSystem()
          return
        }

        const cookies = await wc.session.cookies.get({ url })
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

        if (cookieStr) {
          await addDownload(url, { filename, referer, cookies: cookieStr, headers: [], category: config.defaultCategory })
        } else {
          await addDownload(url, { filename, referer, category: config.defaultCategory })
        }

        // 按发起下载的 webContents 反查所属标签，通知渲染进程
        const win = BrowserWindow.fromWebContents(wc)
        let tabId: string | null = null
        for (const [tid, entry] of views) {
          if (entry.view.webContents === wc) {
            tabId = tid
            break
          }
        }
        if (win && !win.isDestroyed() && tabId) {
          win.webContents.send('on:download:started', { url, filename, tabId })
        }
      } catch (e) {
        console.error('[Aria2] 添加下载失败，回退到系统下载器:', url, e)
        // aria2 添加失败：已 preventDefault，需手动用系统下载器兜底，避免文件丢失
        fallbackToSystem()
      }
    })()
  })
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
