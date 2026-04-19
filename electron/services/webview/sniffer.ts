import type { BrowserWindow } from 'electron'
import type { ViewEntry } from './types'

export function startSniffing(
  entry: ViewEntry,
  mainWindow: BrowserWindow | null,
  snifferEnabled: Map<string, boolean>,
  views: Map<string, ViewEntry>,
  sessionSnifferInstalled: Set<string>
): void {
  if (entry.view.webContents.isDestroyed()) return
  if (!mainWindow || mainWindow.isDestroyed()) return

  const sessionKey = entry.containerId || '__default__'

  if (!sessionSnifferInstalled.has(sessionKey)) {
    const session = entry.view.webContents.session

    const listener = (details: Electron.OnCompletedListenerDetails) => {
      if (!details.resourceType || details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') return

      const contentType = details.responseHeaders?.['content-type']?.[0]
        || details.responseHeaders?.['Content-Type']?.[0]
        || ''

      let resourceType: 'video' | 'audio' | 'image' | null = null
      if (/^video\//i.test(contentType)) resourceType = 'video'
      else if (/^audio\//i.test(contentType)) resourceType = 'audio'
      else if (/^image\//i.test(contentType)) resourceType = 'image'

      if (!resourceType) return

      const contentLength = details.responseHeaders?.['content-length']?.[0]
        || details.responseHeaders?.['Content-Length']?.[0]

      const resource = {
        id: `sniff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: details.url,
        type: resourceType,
        mimeType: contentType.split(';')[0].trim(),
        size: contentLength ? parseInt(contentLength, 10) : undefined,
        timestamp: Date.now()
      }

      if (!mainWindow.isDestroyed()) {
        for (const [tid, enabled] of snifferEnabled) {
          if (!enabled) continue
          const e = views.get(tid)
          if (!e || e.view.webContents.isDestroyed()) continue
          if (e.containerId !== entry.containerId) continue
          mainWindow.webContents.send('on:sniffer:resource', tid, resource)
        }
      }
    }

    session.webRequest.onCompleted(listener)
    sessionSnifferInstalled.add(sessionKey)
  }
}

export function cleanupSessionSniffer(
  containerId: string,
  snifferEnabled: Map<string, boolean>,
  views: Map<string, ViewEntry>,
  sessionSnifferInstalled: Set<string>
): void {
  const sessionKey = containerId || '__default__'
  if (!sessionSnifferInstalled.has(sessionKey)) return

  for (const [tid, enabled] of snifferEnabled) {
    if (!enabled) continue
    const e = views.get(tid)
    if (e && (e.containerId || '') === containerId) return
  }

  for (const [, e] of views) {
    if ((e.containerId || '') === containerId && !e.view.webContents.isDestroyed()) {
      try {
        e.view.webContents.session.webRequest.onCompleted(() => {})
      } catch {
        // 忽略
      }
      break
    }
  }
  sessionSnifferInstalled.delete(sessionKey)
}
