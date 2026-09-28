import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { URL } from 'node:url'
import { webviewManager } from './webview-manager'
import { getPageById, getSessionApiSettings, listPages } from './store'

export interface SessionCookie {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
}

export interface SessionService {
  getCookies(pageId: string, url?: string): Promise<SessionCookie[]>
  openPage(pageId: string, url: string): Promise<{ pageId: string; url: string }>
  execute(pageId: string, code: string): Promise<unknown>
}

function resolveWebContents(pageId: string) {
  if (!pageId || !getPageById(pageId)) throw new Error(`页面 ${pageId || '(empty)'} 不存在`)
  const wc = webviewManager.getWebContentsByPageId(pageId)
  if (!wc) throw new Error(`页面 ${pageId} 当前没有打开的标签页`)
  return wc
}

export const sessionService: SessionService = {
  async getCookies(pageId, url) {
    const wc = resolveWebContents(pageId)
    return (await wc.session.cookies.get(url ? { url } : {})).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expirationDate
    }))
  },
  async openPage(pageId, url) {
    if (!pageId || !getPageById(pageId)) throw new Error(`页面 ${pageId || '(empty)'} 不存在`)
    const mainWindow = webviewManager.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('SessionBox 主窗口不可用')
    mainWindow.webContents.send('on:tab:open-url', pageId, url)
    return { pageId, url }
  },
  async execute(pageId, code) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('code 不能为空')
    return await resolveWebContents(pageId).executeJavaScript(code)
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Authorization,Content-Type'
  })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

let activeServer: Server | null = null

export function startSessionApiServer(port = getSessionApiSettings().port, token = getSessionApiSettings().token): Server {
  if (activeServer) return activeServer
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return json(res, 204, {})
      if (token && req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: 'unauthorized' })
      const parsed = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
      if (req.method === 'GET' && parsed.pathname === '/api/v1/pages') {
        const openViews = webviewManager.listOpenPageViews()
        const openByPage = new Map(openViews.map((view) => [view.pageId, view]))
        return json(res, 200, { pages: listPages().map((page) => {
          const view = openByPage.get(page.id)
          return { id: page.id, name: page.name, url: page.url, currentUrl: view?.url || page.url, title: view?.title || page.name, groupId: page.groupId, open: !!view }
        }) })
      }
      const match = parsed.pathname.match(/^\/api\/v1\/pages\/([^/]+)(?:\/(cookies|open|execute))?$/)
      if (!match) return json(res, 404, { error: 'not_found' })
      const pageId = decodeURIComponent(match[1])
      const action = match[2]
      if (req.method === 'GET' && action === 'cookies') {
        return json(res, 200, { pageId, cookies: await sessionService.getCookies(pageId, parsed.searchParams.get('url') || undefined) })
      }
      if (req.method === 'POST' && action === 'open') {
        const body = await readBody(req)
        return json(res, 200, await sessionService.openPage(pageId, String(body.url || '')))
      }
      if (req.method === 'POST' && action === 'execute') {
        const body = await readBody(req)
        return json(res, 200, { pageId, result: await sessionService.execute(pageId, String(body.code || '')) })
      }
      return json(res, 405, { error: 'method_not_allowed' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return json(res, message.includes('不存在') ? 404 : 500, { error: message })
    }
  })
  server.listen(port, '127.0.0.1')
  server.on('listening', () => console.info(`[SessionApi] listening on http://127.0.0.1:${port}`))
  server.on('error', (error) => console.error('[SessionApi] server error', error))
  activeServer = server
  return server
}

export function stopSessionApiServer(): void {
  if (!activeServer) return
  activeServer.close()
  activeServer = null
}
