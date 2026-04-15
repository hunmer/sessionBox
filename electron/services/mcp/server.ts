import { BrowserWindow } from 'electron'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as store from '../store'
import { webviewManager } from '../webview-manager'
import { registerAllTools } from './tools'
import type { ToolContext, McpStatus } from './types'

class McpServerService {
  private server: McpServer | null = null
  private transport: StdioServerTransport | null = null
  private toolCount = 0
  private running = false

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

    this.transport = new StdioServerTransport()
    await this.server.connect(this.transport)

    this.running = true
    console.log(`[MCP] Server started, ${this.toolCount} tools registered`)
  }

  async stop(): Promise<void> {
    if (!this.running) return

    try {
      if (this.transport) {
        await this.transport.close()
        this.transport = null
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
      toolCount: this.toolCount
    }
  }

  isRunning(): boolean {
    return this.running
  }
}

export const mcpServerService = new McpServerService()
