import type { BrowserWindow } from 'electron'

/**
 * MCP 工具的统一上下文
 * 每个工具通过此接口访问主进程能力
 */
export interface ToolContext {
  store: typeof import('../store')
  bookmarkStore: typeof import('../bookmark-store')
  webviewManager: any
  mainWindow: BrowserWindow | null
}

/** MCP Server 状态 */
export interface McpStatus {
  enabled: boolean
  running: boolean
  toolCount: number
  port: number
}
