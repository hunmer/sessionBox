import { BrowserWindow } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as store from '../store'
import { webviewManager } from '../webview-manager'
import { registerAllTools } from './tools'
import type { ToolContext, McpStatus } from './types'

const DEFAULT_PORT = 9527

class McpServerService {
  private server: McpServer | null = null
  private httpServer: Server | null = null
  private toolCount = 0
  private running = false
  private port = DEFAULT_PORT

  async start(): Promise<void> {
    if (this.running) return

    const ctx: ToolContext = {
      store,
      webviewManager,
      mainWindow: webviewManager.getMainWindow()
    }

    this.server = new McpServer({
      name: 'sessionbox-mcp',
      version: '1.0.0'
    })

    this.toolCount = registerAllTools(this.server, ctx)

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    })

    await this.server.connect(transport)

    // 创建 HTTP 服务器，所有请求路由到 transport
    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS 头，允许本地 MCP 客户端连接
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // 解析请求体
      let body: unknown = undefined
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await this.parseBody(req)
      }

      try {
        await transport.handleRequest(req, res, body)
      } catch (error) {
        console.error('[MCP] Error handling request:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      }
    })

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, () => {
        resolve()
      })
      this.httpServer!.on('error', reject)
    })

    this.running = true
    console.log(`[MCP] Server started on port ${this.port}, ${this.toolCount} tools registered`)
  }

  async stop(): Promise<void> {
    if (!this.running) return

    try {
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => resolve())
        })
        this.httpServer = null
      }
      if (this.server) {
        await this.server.close()
        this.server = null
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
