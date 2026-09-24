import type { ExtensionContext } from '../context'

/** Bridges Electron session webRequest events to MV3 webRequest listeners. */
export class WebRequestAPI {
  constructor(private ctx: ExtensionContext) {
    const webRequest = ctx.session.webRequest
    const normalizeHeaders = (headers: any) => {
      if (Array.isArray(headers)) return headers
      if (!headers || typeof headers !== 'object') return headers
      return Object.entries(headers).flatMap(([name, value]) => {
        const values = Array.isArray(value) ? value : [value]
        return values.map((item) => ({ name, value: String(item) }))
      })
    }
    const forward = (eventName: string) => (details: any) => {
      const normalized = {
        ...details,
        requestHeaders: normalizeHeaders(details.requestHeaders),
        responseHeaders: normalizeHeaders(details.responseHeaders),
        // Electron exposes the owning WebContents as webContentsId. Chrome's
        // webRequest tabId uses the same numeric tab identity in this package.
        tabId: typeof details.webContentsId === 'number'
          ? details.webContentsId
          : (typeof details.tabId === 'number' ? details.tabId : -1),
        frameId: typeof details.frameId === 'number' ? details.frameId : 0,
        timeStamp: details.timestamp || Date.now(),
      }
      ctx.router.broadcastEvent(`webRequest.${eventName}`, normalized)
    }

    webRequest.onSendHeaders({ urls: ['<all_urls>'] }, forward('onSendHeaders') as any)
    webRequest.onResponseStarted({ urls: ['<all_urls>'] }, forward('onResponseStarted') as any)
    webRequest.onErrorOccurred({ urls: ['<all_urls>'] }, forward('onErrorOccurred') as any)
    webRequest.onCompleted({ urls: ['<all_urls>'] }, forward('onCompleted') as any)
    webRequest.onBeforeRedirect({ urls: ['<all_urls>'] }, forward('onBeforeRedirect') as any)
    webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, ((details: any, callback: (response: any) => void) => {
      forward('onBeforeRequest')(details)
      callback({})
    }) as any)
  }
}
