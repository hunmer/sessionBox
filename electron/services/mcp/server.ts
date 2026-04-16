import { BrowserWindow } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import * as store from '../store'
import * as bookmarkStore from '../bookmark-store'
import { webviewManager } from '../webview-manager'
import { registerAllTools } from './tools'
import type { ToolContext, McpStatus } from './types'

const DEFAULT_PORT = 9527

interface Session {
  server: McpServer
  transport: SSEServerTransport
}

class McpServerService {
  private httpServer: Server | null = null
  private sessions = new Map<string, Session>()
  private running = false
  private port = DEFAULT_PORT
  private toolCount = 0

  async start(): Promise<void> {
    if (this.running) return

    const ctx: ToolContext = {
      store,
      bookmarkStore,
      webviewManager,
      mainWindow: webviewManager.getMainWindow()
    }

    this.httpServer = createServer()

    // SSE 端点：客户端通过 GET /sse 建立 SSE 流
    this.httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${this.port}`)
      const pathname = url.pathname

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // GET /sse — 建立 SSE 连接
      if (req.method === 'GET' && pathname === '/sse') {
        try {
          const transport = new SSEServerTransport('/messages', res)
          const server = new McpServer({ name: 'sessionbox-mcp', version: '1.0.0' })
          this.toolCount = registerAllTools(server, ctx)
          await server.connect(transport)

          const sessionId = transport.sessionId
          this.sessions.set(sessionId, { server, transport })

          transport.onclose = () => {
            console.log(`[MCP] Session closed: ${sessionId}`)
            this.sessions.delete(sessionId)
          }

          console.log(`[MCP] New session: ${sessionId}, total: ${this.sessions.size}`)
        } catch (error) {
          console.error('[MCP] Error establishing SSE connection:', error)
          if (!res.headersSent) {
            res.writeHead(500)
            res.end('Internal server error')
          }
        }
        return
      }

      // POST /messages — 接收客户端消息
      if (req.method === 'POST' && pathname === '/messages') {
        const sessionId = url.searchParams.get('sessionId')
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing sessionId' }))
          return
        }

        const session = this.sessions.get(sessionId)
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Session not found' }))
          return
        }

        try {
          const body = await this.parseBody(req)
          await session.transport.handlePostMessage(req, res, body)
        } catch (error) {
          console.error('[MCP] Error handling POST:', error)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Internal server error' }))
          }
        }
        return
      }

      // 未知路径
      res.writeHead(404)
      res.end('Not found')
    })

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, () => resolve())
      this.httpServer!.on('error', reject)
    })

    this.running = true
    console.log(`[MCP] Server started on port ${this.port}, ${this.toolCount} tools registered`)
  }

  async stop(): Promise<void> {
    if (!this.running) return

    try {
      // 关闭所有会话
      for (const [id, session] of this.sessions) {
        try {
          await session.transport.close()
          await session.server.close()
        } catch { /* ignore */ }
      }
      this.sessions.clear()

      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => resolve())
        })
        this.httpServer = null
      }
    } catch (error) {
      console.error('[MCP] Error stopping server:', error)
    }

    this.running = false
    this.toolCount = 0
    console.log('[MCP] Server stopped')
  }

  getStatus(): McpStatus {
    return {
      enabled: store.getMcpEnabled(),
      running: this.running,
      toolCount: this.toolCount,
      port: this.port
    }
  }

  isRunning(): boolean {
    return this.running
  }

  getPort(): number {
    return this.port
  }

  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (!raw) {
          resolve(undefined)
          return
        }
        try {
          resolve(JSON.parse(raw))
        } catch {
          resolve(raw)
        }
      })
      req.on('error', reject)
    })
  }
}

export const mcpServerService = new McpServerService()
