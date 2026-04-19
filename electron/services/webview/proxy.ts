import type { BrowserWindow } from 'electron'
import type { ViewEntry } from './types'
import { getProxyById, getContainerById, getGroupById, getPageById, type Proxy } from '../store'
import { applyProxyToSession, fetchSessionExitIp } from '../proxy'

export interface ProxyRuntimeState {
  proxy?: Proxy
  isOverride: boolean
  proxyEnabled: boolean
  applied: boolean
  bindingText?: string
}

export function getEffectiveProxy(pageId: string): Proxy | undefined {
  const page = getPageById(pageId)
  if (!page) return undefined
  const containerId = page.containerId || 'default'
  const container = getContainerById(containerId)
  const proxyId = page.proxyId ?? container?.proxyId ?? getGroupById(page.groupId)?.proxyId
  return proxyId ? getProxyById(proxyId) : undefined
}

export function getProxyBindingText(proxy: Proxy): string {
  if (proxy.proxyMode === 'pac_url') {
    return proxy.pacUrl?.trim() || proxy.name
  }
  if (proxy.proxyMode === 'custom') {
    return proxy.name
  }
  return proxy.host?.trim() || proxy.name
}

export function resolveProxyRuntimeState(
  tabId: string,
  entry: ViewEntry,
  sessionProxyEnabled: Map<string, boolean>,
  tabProxyOverride: Map<string, string>
): ProxyRuntimeState {
  const overrideProxyId = tabProxyOverride.get(tabId)
  let proxy: Proxy | undefined
  let isOverride = false

  if (overrideProxyId) {
    proxy = getProxyById(overrideProxyId)
    isOverride = !!proxy
  }

  if (!proxy) {
    proxy = getEffectiveProxy(entry.pageId)
  }

  if (!proxy) {
    return { isOverride: false, proxyEnabled: false, applied: false }
  }

  const proxyEnabled = proxy.enabled !== false
  const applied = isOverride
    ? proxyEnabled
    : proxyEnabled && (sessionProxyEnabled.get(entry.containerId) ?? false)

  return { proxy, isOverride, proxyEnabled, applied, bindingText: getProxyBindingText(proxy) }
}

export function sendProxyInfo(
  mainWindow: BrowserWindow | null,
  tabId: string,
  payload: Record<string, unknown> | null
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('on:tab:proxy-info', tabId, payload)
}

export async function refreshProxyInfo(
  mainWindow: BrowserWindow | null,
  tabId: string,
  entry: ViewEntry,
  sessionProxyEnabled: Map<string, boolean>,
  tabProxyOverride: Map<string, string>
): Promise<void> {
  if (entry.view.webContents.isDestroyed()) {
    sendProxyInfo(mainWindow, tabId, null)
    return
  }

  const { proxy, isOverride, proxyEnabled, applied, bindingText } = resolveProxyRuntimeState(
    tabId, entry, sessionProxyEnabled, tabProxyOverride
  )

  if (!proxy) {
    sendProxyInfo(mainWindow, tabId, null)
    return
  }

  sendProxyInfo(mainWindow, tabId, {
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

export async function detectProxyInfo(
  mainWindow: BrowserWindow | null,
  tabId: string,
  entry: ViewEntry,
  sessionProxyEnabled: Map<string, boolean>,
  tabProxyOverride: Map<string, string>
): Promise<{ ok: boolean; ip?: string; error?: string }> {
  if (entry.view.webContents.isDestroyed()) {
    sendProxyInfo(mainWindow, tabId, null)
    return { ok: false, error: '标签页不存在' }
  }

  const { proxy, isOverride, proxyEnabled, applied, bindingText } = resolveProxyRuntimeState(
    tabId, entry, sessionProxyEnabled, tabProxyOverride
  )

  if (!proxy) {
    sendProxyInfo(mainWindow, tabId, null)
    return { ok: false, error: '当前标签页未绑定代理' }
  }

  sendProxyInfo(mainWindow, tabId, {
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
    sendProxyInfo(mainWindow, tabId, {
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
    sendProxyInfo(mainWindow, tabId, {
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
