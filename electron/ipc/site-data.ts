import { ipcMain } from 'electron'
import { webviewManager } from '../services/webview-manager'

export interface SiteDataInfo {
  origin: string
  hostname: string
  cookieCount: number
  storageBytes: number
  usageBytes: number
  quotaBytes: number
}

const EMPTY_INFO: SiteDataInfo = {
  origin: '',
  hostname: '',
  cookieCount: 0,
  storageBytes: 0,
  usageBytes: 0,
  quotaBytes: 0,
}

/** 在页面内估算 localStorage 字节大小（key+value 的 UTF-16 字节数） */
const LOCALSTORAGE_ESTIMATE_SCRIPT = `
(() => {
  try {
    let bytes = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || ''
      const val = localStorage.getItem(key) || ''
      // UTF-16：每个字符 2 字节
      bytes += (key.length + val.length) * 2
    }
    return bytes
  } catch {
    return 0
  }
})()
`

/**
 * 注册站点数据（cookie / storage）相关 IPC
 * - getInfo：查询当前 tab 对应站点的 cookie 数量、localStorage 大小、总占用与配额
 * - clear：清理当前域名（origin）的 cookie / localStorage / IndexedDB / cache 等，并刷新页面
 */
export function registerSiteDataIpc(): void {
  ipcMain.handle('siteData:getInfo', async (_e, tabId: string): Promise<SiteDataInfo> => {
    const wc = webviewManager.getWebContents(tabId)
    if (!wc) return { ...EMPTY_INFO }

    const url = wc.getURL()
    if (!url || url.startsWith('sessionbox://')) return { ...EMPTY_INFO }

    let origin = ''
    let hostname = ''
    try {
      const u = new URL(url)
      origin = u.origin
      hostname = u.hostname
    } catch {
      return { ...EMPTY_INFO }
    }

    // cookie 数量
    let cookieCount = 0
    try {
      const cookies = await wc.session.cookies.get({ url })
      cookieCount = cookies.length
    } catch { /* 忽略 */ }

    // localStorage 大小 + 总占用 / 配额
    let storageBytes = 0
    let usageBytes = 0
    let quotaBytes = 0
    try {
      const estimate = await wc.executeJavaScript('navigator.storage.estimate()')
      if (estimate) {
        usageBytes = estimate.usage ?? 0
        quotaBytes = estimate.quota ?? 0
      }
    } catch { /* 忽略 */ }
    try {
      storageBytes = await wc.executeJavaScript(LOCALSTORAGE_ESTIMATE_SCRIPT)
      if (typeof storageBytes !== 'number') storageBytes = 0
    } catch { /* 忽略 */ }

    return { origin, hostname, cookieCount, storageBytes, usageBytes, quotaBytes }
  })

  ipcMain.handle('siteData:clear', async (_e, tabId: string): Promise<{ success: boolean }> => {
    const wc = webviewManager.getWebContents(tabId)
    if (!wc) return { success: false }

    const url = wc.getURL()
    if (!url || url.startsWith('sessionbox://')) return { success: false }

    let origin = ''
    try {
      origin = new URL(url).origin
    } catch {
      return { success: false }
    }

    try {
      // 清当前域名 cookies
      const cookies = await wc.session.cookies.get({ url })
      await Promise.all(
        cookies.map((c) => wc.session.cookies.remove(url, c.name).catch(() => {})),
      )

      // 清当前 origin 的 storage（localstorage / indexdb / websql / filesystem / serviceworkers / cachestorage / shadercache）
      await wc.session.clearStorageData({
        origin,
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      })

      // 刷新页面，让网站以无数据状态重新加载
      webviewManager.reload(tabId)
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  /**
   * 手动粘贴导入 Cookie
   * 解析用户粘贴的 cookie 字符串（支持 `name=value; name2=value2` 或每行一条），应用到当前域名。
   * 追加/覆盖同名，不清空其他 cookie。导入后自动刷新页面让网站识别新登录态。
   */
  ipcMain.handle(
    'siteData:importCookies',
    async (_e, tabId: string, cookieText: string): Promise<{ success: boolean; count: number; skipped: number }> => {
      const wc = webviewManager.getWebContents(tabId)
      if (!wc) return { success: false, count: 0, skipped: 0 }

      const url = wc.getURL()
      if (!url || url.startsWith('sessionbox://')) return { success: false, count: 0, skipped: 0 }

      let origin = ''
      try {
        origin = new URL(url).origin
      } catch {
        return { success: false, count: 0, skipped: 0 }
      }

      const parsed = parseCookieText(cookieText)
      if (!parsed.length) return { success: false, count: 0, skipped: 0 }

      let count = 0
      let skipped = 0
      const isHttps = origin.startsWith('https://')

      for (const { name, value } of parsed) {
        try {
          await wc.session.cookies.set({
            url: origin,
            name,
            value,
            path: '/',
            secure: isHttps,
          })
          count++
        } catch {
          skipped++
        }
      }

      // 让网站识别新登录态
      if (count > 0) webviewManager.reload(tabId)
      return { success: count > 0, count, skipped }
    },
  )
}

/**
 * 解析 cookie 字符串，兼容两种格式：
 * 1. 标准 Cookie 头：`name1=value1; name2=value2`（DevTools Network 复制 / curl 格式）
 * 2. 每行一条：`name=value` 换行分隔（Cookie 编辑器扩展导出）
 * - 自动按 `;` 或换行分割
 * - 跳过空行、`#` 注释、不含 `=` 的条目
 * - value 按第一个 `=` 分割（允许 value 包含 `=`）
 * - 同名后者覆盖前者（Map 去重）
 */
function parseCookieText(raw: string): Array<{ name: string; value: string }> {
  if (!raw) return []
  // 统一分隔：`;` 或换行
  const parts = raw.split(/[;\n\r]+/)
  const result = new Map<string, string>()

  for (let part of parts) {
    part = part.trim()
    if (!part || part.startsWith('#')) continue
    const eqIdx = part.indexOf('=')
    if (eqIdx <= 0) continue // 无 `=` 或 name 为空
    const name = part.slice(0, eqIdx).trim()
    const value = part.slice(eqIdx + 1).trim()
    if (!name) continue
    result.set(name, value) // 同名覆盖
  }

  return Array.from(result, ([name, value]) => ({ name, value }))
}
