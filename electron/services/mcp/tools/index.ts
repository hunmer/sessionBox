import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../types'
import { registerQueryTools } from './query'
import { registerTabTools } from './tab'
import { registerCdpTools } from './cdp'

export function registerAllTools(server: McpServer, ctx: ToolContext): number {
  let total = 0
  total += registerQueryTools(server, ctx)
  total += registerTabTools(server, ctx)
  total += registerCdpTools(server, ctx)
  return total
}
